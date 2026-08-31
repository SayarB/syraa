"""Feasibility ingest: structure → topics + bridge/leaf chunks → JSON.

No embeddings / DB. Matches Syraa leveled context model:
  - topics: tree spine
  - bridge chunks: summary of a child topic, child_topic_id set
  - leaf chunks: full section text under a leaf topic, child_topic_id null
"""

from __future__ import annotations

import hashlib
import re
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from syraa_ingest.heading_heuristics.heuristics import TopicNode
from syraa_ingest.heading_heuristics.structure import extract_structure_tree


def _uuid() -> str:
    return str(uuid.uuid4())


def _slug(text: str, max_len: int = 48) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", text.strip().lower()).strip("-")
    return (s[:max_len] or "topic").rstrip("-")


def _estimate_tokens(text: str) -> int:
    # Rough: ~4 chars/token for English prose
    return max(1, (len(text) + 3) // 4)


@dataclass
class TopicRecord:
    id: str
    parent_id: str | None
    title: str
    level: int
    path: str
    ordinal: int
    page_start: int | None
    page_end: int | None
    depth: int
    source: str = "extracted"


@dataclass
class ChunkRecord:
    id: str
    parent_topic_id: str
    child_topic_id: str | None
    role: str  # bridge | leaf
    text: str
    ordinal: int
    token_estimate: int
    page_start: int | None = None
    page_end: int | None = None
    anchor: dict[str, Any] = field(default_factory=dict)


def flatten_topics(
    root: TopicNode,
    page_count: int,
    structure_source: str,
) -> list[TopicRecord]:
    """Assign ids, paths, page ranges from outline pages."""
    root_id = _uuid()
    records: list[TopicRecord] = [
        TopicRecord(
            id=root_id,
            parent_id=None,
            title=root.title or "Document",
            level=-1,
            path="/" + _slug(root.title or "document"),
            ordinal=0,
            page_start=1,
            page_end=page_count,
            depth=0,
            source="extracted",
        )
    ]

    def add_children(parent_node: TopicNode, parent_rec: TopicRecord) -> None:
        for i, child in enumerate(parent_node.children):
            tid = _uuid()
            path = f"{parent_rec.path.rstrip('/')}/{_slug(child.title)}"
            page_start = child.page if child.page and child.page > 0 else parent_rec.page_start
            rec = TopicRecord(
                id=tid,
                parent_id=parent_rec.id,
                title=child.title,
                level=child.level,
                path=path,
                ordinal=i,
                page_start=page_start,
                page_end=None,
                depth=parent_rec.depth + 1,
                source="extracted",
            )
            records.append(rec)
            add_children(child, rec)

    add_children(root, records[0])

    def siblings(parent_id: str | None) -> list[TopicRecord]:
        return sorted(
            [r for r in records if r.parent_id == parent_id],
            key=lambda r: r.ordinal,
        )

    def assign_ends(parent_id: str | None, parent_end: int) -> None:
        kids = siblings(parent_id)
        for i, kid in enumerate(kids):
            if i + 1 < len(kids):
                nxt = kids[i + 1].page_start or parent_end
                kid.page_end = max(kid.page_start or 1, int(nxt) - 1)
            else:
                kid.page_end = parent_end
            if kid.page_start and kid.page_end and kid.page_end < kid.page_start:
                kid.page_end = kid.page_start
            assign_ends(kid.id, kid.page_end or parent_end)

    assign_ends(root_id, page_count)
    return records


def extract_page_texts(pdf: Path) -> dict[int, str]:
    import pymupdf

    texts: dict[int, str] = {}
    doc = pymupdf.open(pdf)
    try:
        for i, page in enumerate(doc):
            texts[i + 1] = page.get_text("text") or ""
    finally:
        doc.close()
    return texts


def section_text(
    page_texts: dict[int, str],
    page_start: int | None,
    page_end: int | None,
    *,
    skip_pages: set[int] | None = None,
) -> str:
    if not page_start:
        return ""
    end = page_end or page_start
    skip = skip_pages or set()
    parts: list[str] = []
    for p in range(page_start, end + 1):
        if p in skip:
            continue
        t = page_texts.get(p, "").strip()
        if t:
            parts.append(t)
    return "\n\n".join(parts).strip()


def split_leaf_chunks(
    text: str,
    *,
    target_chars: int = 1800,
    overlap_chars: int = 120,
) -> list[str]:
    """Split leaf body on paragraph boundaries near target size."""
    text = text.strip()
    if not text:
        return []
    if len(text) <= target_chars:
        return [text]

    paras = re.split(r"\n\s*\n", text)
    chunks: list[str] = []
    buf = ""
    for para in paras:
        para = para.strip()
        if not para:
            continue
        if not buf:
            buf = para
            continue
        if len(buf) + 2 + len(para) <= target_chars:
            buf = f"{buf}\n\n{para}"
        else:
            chunks.append(buf)
            # overlap: keep tail of previous
            tail = buf[-overlap_chars:] if overlap_chars else ""
            buf = f"{tail}\n\n{para}".strip() if tail else para
    if buf:
        chunks.append(buf)
    return chunks


def bridge_summary(title: str, body: str, *, max_chars: int = 600) -> str:
    """Cheap bridge text without LLM: title + lead paragraphs."""
    body = re.sub(r"\s+", " ", body).strip()
    if not body:
        return f"{title}."
    lead = body[:max_chars].rsplit(" ", 1)[0] if len(body) > max_chars else body
    if len(body) > max_chars:
        lead = lead.rstrip(".,;:") + "…"
    return f"{title}. {lead}"


def materialize_chunks(
    topics: list[TopicRecord],
    page_texts: dict[int, str],
    *,
    toc_pages: set[int] | None = None,
    leaf_target_chars: int = 1800,
) -> list[ChunkRecord]:
    """Create bridge chunks for non-leaves and leaf chunks for leaves."""
    by_parent: dict[str | None, list[TopicRecord]] = {}
    for t in topics:
        by_parent.setdefault(t.parent_id, []).append(t)
    for kids in by_parent.values():
        kids.sort(key=lambda r: r.ordinal)

    skip = toc_pages or set()
    chunks: list[ChunkRecord] = []

    for topic in topics:
        children = by_parent.get(topic.id, [])
        if children:
            # Bridge: one summary chunk per child, hanging under this topic
            for i, child in enumerate(children):
                body = section_text(
                    page_texts,
                    child.page_start,
                    child.page_end,
                    skip_pages=skip,
                )
                # Prefer lead from child's exclusive pages (exclude grandchildren span? keep simple)
                text = bridge_summary(child.title, body)
                chunks.append(
                    ChunkRecord(
                        id=_uuid(),
                        parent_topic_id=topic.id,
                        child_topic_id=child.id,
                        role="bridge",
                        text=text,
                        ordinal=i,
                        token_estimate=_estimate_tokens(text),
                        page_start=child.page_start,
                        page_end=child.page_end,
                        anchor={"heading": child.title},
                    )
                )
        else:
            # Leaf: full section text split into chunks
            body = section_text(
                page_texts,
                topic.page_start,
                topic.page_end,
                skip_pages=skip,
            )
            parts = split_leaf_chunks(body, target_chars=leaf_target_chars)
            if not parts and topic.title:
                parts = [topic.title]
            for i, part in enumerate(parts):
                chunks.append(
                    ChunkRecord(
                        id=_uuid(),
                        parent_topic_id=topic.id,
                        child_topic_id=None,
                        role="leaf",
                        text=part,
                        ordinal=i,
                        token_estimate=_estimate_tokens(part),
                        page_start=topic.page_start,
                        page_end=topic.page_end,
                        anchor={"heading": topic.title, "part": i},
                    )
                )

    return chunks


def build_card(topics: list[TopicRecord], root_title: str, chunk_count: int) -> dict[str, Any]:
    outline = [
        {"title": t.title, "path": t.path, "page_start": t.page_start, "depth": t.depth}
        for t in topics
        if t.level >= 0
    ]
    return {
        "card_type": "generic",
        "title": root_title,
        "summary": f"Ingested outline with {len(outline)} topics and {chunk_count} chunks.",
        "outline": outline[:80],
        "entities": {},
        "constraints": {},
        "version": 1,
    }


def content_hash(pdf: Path) -> str:
    h = hashlib.sha256()
    with pdf.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def ingest_pdf(
    pdf: Path,
    *,
    source_mode: str = "auto",
    min_score: float = 4.0,
    max_levels: int = 6,
    leaf_target_chars: int = 1800,
) -> dict[str, Any]:
    tree, meta = extract_structure_tree(
        pdf,
        source_mode=source_mode,
        min_score=min_score,
        max_levels=max_levels,
    )
    page_count = int(meta["page_count"])
    topics = flatten_topics(tree, page_count, structure_source=meta["source"])
    page_texts = extract_page_texts(pdf)
    toc_pages = set(meta.get("toc_pages") or [])
    chunks = materialize_chunks(
        topics,
        page_texts,
        toc_pages=toc_pages,
        leaf_target_chars=leaf_target_chars,
    )
    card = build_card(topics, meta["title"], len(chunks))

    bridges = sum(1 for c in chunks if c.role == "bridge")
    leaves = sum(1 for c in chunks if c.role == "leaf")

    return {
        "resource": {
            "path": str(pdf.resolve()),
            "name": pdf.name,
            "content_hash": content_hash(pdf),
            "page_count": page_count,
            "status": "ready",
            "structure_source": meta["source"],
            "title": meta["title"],
        },
        "meta": {
            "toc_pages": meta.get("toc_pages"),
            "structure_stats": meta.get("stats"),
            "topic_count": len(topics),
            "chunk_count": len(chunks),
            "bridge_count": bridges,
            "leaf_count": leaves,
        },
        "card": card,
        "topics": [asdict(t) for t in topics],
        "chunks": [asdict(c) for c in chunks],
        "tree": tree.to_dict(),
    }
