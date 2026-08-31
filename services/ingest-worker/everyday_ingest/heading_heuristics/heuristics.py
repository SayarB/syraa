"""Heading heuristics for PDF structure-first topic trees.

Feasibility module: score lines from PyMuPDF spans, cluster heading levels,
build a parent/child tree. No LLM. No embeddings.
"""

from __future__ import annotations

import re
import statistics
from collections.abc import Iterable
from dataclasses import asdict, dataclass, field
from typing import Any

CHAPTER_RE = re.compile(
    r"^(chapter|section|unit|part|appendix|lesson|module)\b",
    re.I,
)
NUMBERED_RE = re.compile(r"^(\d+(?:\.\d+)*)[.)\s]+(\S.+)$")
PAGE_NUM_RE = re.compile(r"^\d{1,4}$")
HEADER_FOOTER_RE = re.compile(r"^(page\s+\d+|confidential|draft)\b", re.I)
TOC_HEADING_RE = re.compile(r"^table\s+of\s+contents$", re.I)
# Common printed-TOC markers: I. / II. / A. / B. / 1. / 1.2
TOC_ENTRY_START_RE = re.compile(
    r"^(?:"
    r"(?:M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3}))\."  # Roman
    r"|[A-Z]\."  # Letter section
    r"|\d+(?:\.\d+)*[.)]"  # Numbered
    r"|chapter\s+\d+"
    r"|section\s+\d+"
    r"|part\s+[IVXLC\d]+"
    r")\s+\S",
    re.I,
)
ROMAN_ENTRY_RE = re.compile(
    r"^(M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3}))\.\s+",
    re.I,
)
LETTER_ENTRY_RE = re.compile(r"^([A-Z])\.\s+")
DOTTED_NUMBER_ENTRY_RE = re.compile(r"^(\d+(?:\.\d+)*)[.)]\s+")
LEADER_DOTS_RE = re.compile(r"[\.\u2022·]{2,}\s*")
INLINE_TOC_PAGE_RE = re.compile(r"^(?P<title>.+?)\s+" + r"(?P<page>\d{1,4})$")


@dataclass
class Line:
    text: str
    page: int
    y: float
    x: float
    font_size: float
    bold: bool
    font_name: str = ""
    score: float = 0.0
    level: int | None = None
    number_path: tuple[int, ...] | None = None


@dataclass
class TopicNode:
    title: str
    level: int
    page: int | None = None
    font_size: float | None = None
    score: float | None = None
    number_path: tuple[int, ...] | None = None
    children: list[TopicNode] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "level": self.level,
            "page": self.page,
            "font_size": self.font_size,
            "score": self.score,
            "number_path": list(self.number_path) if self.number_path else None,
            "children": [c.to_dict() for c in self.children],
        }


def _is_bold(flags: int, font_name: str) -> bool:
    # PyMuPDF: bit 4 (16) often means bold in flags
    if flags & 2**4:
        return True
    name = font_name.lower()
    return "bold" in name or "black" in name or "heavy" in name


def extract_lines(doc: Any) -> list[Line]:
    """Flatten PyMuPDF document into reading-order lines with font metrics."""
    lines: list[Line] = []
    for page_index, page in enumerate(doc):
        data = page.get_text("dict", flags=0)
        for block in data.get("blocks", []):
            if block.get("type", 0) != 0:
                continue
            for line in block.get("lines", []):
                spans = line.get("spans", [])
                if not spans:
                    continue
                text = "".join(s.get("text", "") for s in spans).strip()
                if not text:
                    continue
                # Dominant span by character count
                dominant = max(spans, key=lambda s: len(s.get("text", "")))
                bbox = line.get("bbox", dominant.get("bbox", (0, 0, 0, 0)))
                font_name = dominant.get("font", "") or ""
                flags = int(dominant.get("flags", 0) or 0)
                lines.append(
                    Line(
                        text=text,
                        page=page_index + 1,
                        y=float(bbox[1]),
                        x=float(bbox[0]),
                        font_size=float(dominant.get("size", 0) or 0),
                        bold=_is_bold(flags, font_name),
                        font_name=font_name,
                    )
                )
    return lines


def body_font_size(lines: Iterable[Line]) -> float:
    sizes = [ln.font_size for ln in lines if ln.font_size > 0]
    if not sizes:
        return 12.0
    return float(statistics.median(sizes))


def parse_number_path(text: str) -> tuple[int, ...] | None:
    m = NUMBERED_RE.match(text.strip())
    if not m:
        return None
    try:
        return tuple(int(p) for p in m.group(1).split("."))
    except ValueError:
        return None


def heading_score(line: Line, body_size: float, page_height: float | None = None) -> float:
    text = line.text.strip()
    if not text or PAGE_NUM_RE.match(text) or HEADER_FOOTER_RE.match(text):
        return -10.0

    # Repeated header/footer band (very top / very bottom)
    if page_height and page_height > 0:
        if line.y < page_height * 0.04 or line.y > page_height * 0.96:
            if len(text) < 60:
                return -5.0

    score = 0.0
    if line.font_size >= body_size + 1.5:
        score += 3.0
    if line.font_size >= body_size + 3.5:
        score += 2.0
    if line.font_size >= body_size + 6.0:
        score += 2.0
    if line.bold:
        score += 2.0
    if CHAPTER_RE.match(text):
        score += 3.0

    number_path = parse_number_path(text)
    if number_path:
        score += 3.0
        line.number_path = number_path

    n = len(text)
    if n <= 80:
        score += 1.0
    if n <= 40:
        score += 0.5
    if n > 120:
        score -= 2.0
    if n > 200:
        score -= 3.0

    # All-caps short lines often titles
    letters = [c for c in text if c.isalpha()]
    if letters and sum(c.isupper() for c in letters) / len(letters) > 0.85 and n <= 60:
        score += 1.0

    return score


def score_lines(
    lines: list[Line],
    body_size: float | None = None,
    page_heights: dict[int, float] | None = None,
) -> list[Line]:
    body = body_size if body_size is not None else body_font_size(lines)
    for ln in lines:
        ph = page_heights.get(ln.page) if page_heights else None
        ln.score = heading_score(ln, body, ph)
    return lines


def select_candidates(lines: list[Line], min_score: float = 4.0) -> list[Line]:
    return [ln for ln in lines if ln.score >= min_score]


def assign_levels_by_font(candidates: list[Line], max_levels: int = 6) -> list[Line]:
    """Map distinct font sizes (desc) to levels 0..N-1. Number paths override when present."""
    if not candidates:
        return candidates

    sizes = sorted({round(c.font_size, 1) for c in candidates}, reverse=True)
    size_to_level = {s: min(i, max_levels - 1) for i, s in enumerate(sizes)}

    for c in candidates:
        if c.number_path:
            # "1.2.3" → depth 2
            c.level = min(len(c.number_path) - 1, max_levels - 1)
        else:
            c.level = size_to_level[round(c.font_size, 1)]
    return candidates


def build_tree(
    candidates: list[Line],
    doc_title: str = "Document",
) -> TopicNode:
    root = TopicNode(title=doc_title, level=-1)
    stack: list[TopicNode] = [root]

    ordered = sorted(candidates, key=lambda c: (c.page, c.y, c.x))
    for c in ordered:
        level = 0 if c.level is None else c.level
        while len(stack) > 1 and stack[-1].level >= level:
            stack.pop()
        node = TopicNode(
            title=c.text.strip(),
            level=level,
            page=c.page,
            font_size=c.font_size,
            score=c.score,
            number_path=c.number_path,
        )
        stack[-1].children.append(node)
        stack.append(node)
    return root


def outline_from_bookmarks(doc: Any) -> TopicNode | None:
    """If PDF has a usable outline (embedded bookmarks), prefer it."""
    toc = doc.get_toc(simple=True)  # [level, title, page]
    if not toc or len(toc) < 2:
        return None
    root = TopicNode(title=(doc.metadata or {}).get("title") or "Document", level=-1)
    stack: list[TopicNode] = [root]
    for level, title, page in toc:
        depth = max(int(level) - 1, 0)  # TOC levels are 1-based
        while len(stack) > 1 and stack[-1].level >= depth:
            stack.pop()
        node = TopicNode(title=str(title).strip(), level=depth, page=int(page) if page else None)
        stack[-1].children.append(node)
        stack.append(node)
    return root


def find_toc_pages(lines: list[Line]) -> set[int]:
    """Pages that contain a 'Table of Contents' heading."""
    pages = {ln.page for ln in lines if TOC_HEADING_RE.match(ln.text.strip())}
    if not pages:
        return set()
    # Include immediately following pages that look like TOC continuations
    # (many entries + page-number siblings) until body starts.
    max_page = max(ln.page for ln in lines)
    extended = set(pages)
    for p in range(min(pages), max_page + 1):
        if p in pages:
            continue
        if p - 1 not in extended:
            break
        page_lines = [ln for ln in lines if ln.page == p]
        if any(TOC_HEADING_RE.match(ln.text.strip()) for ln in page_lines):
            extended.add(p)
            continue
        entryish = sum(1 for ln in page_lines if TOC_ENTRY_START_RE.match(ln.text.strip()))
        page_nums = sum(1 for ln in page_lines if PAGE_NUM_RE.match(ln.text.strip()))
        if entryish >= 3 and page_nums >= 3:
            extended.add(p)
        else:
            break
    return extended


def toc_entry_level(title: str, max_levels: int = 6) -> int:
    """Map printed TOC markers to depth.

    Report-style TOCs (this feasibility target):
      Roman I./II./…/X.  → 0
      Letter A./B./C./D. → 1
      Number 1./2.       → 2

    Ambiguity: 'C.' 'I.' 'V.' 'X.' match both Roman and letter. Prefer
    A–D as letters; I/V/X as Roman section markers.
    """
    t = title.strip()
    m = DOTTED_NUMBER_ENTRY_RE.match(t)
    if m:
        parts = m.group(1).split(".")
        if len(parts) == 1:
            return min(2, max_levels - 1)
        return min(len(parts) + 1, max_levels - 1)

    m = LETTER_ENTRY_RE.match(t)
    if m:
        letter = m.group(1).upper()
        if letter in {"A", "B", "C", "D", "E", "F", "G", "H"}:
            return 1
        if letter in {"I", "V", "X"}:
            # Standalone I./V./X. treated as Roman top-level in these reports
            return 0
        return 1

    if ROMAN_ENTRY_RE.match(t):
        return 0
    if CHAPTER_RE.match(t):
        return 0
    return 0


def _cluster_toc_rows(page_lines: list[Line], y_tol: float = 3.0) -> list[list[Line]]:
    ordered = sorted(page_lines, key=lambda ln: (ln.y, ln.x))
    rows: list[list[Line]] = []
    for ln in ordered:
        if not rows:
            rows.append([ln])
            continue
        if abs(ln.y - rows[-1][0].y) <= y_tol:
            rows[-1].append(ln)
        else:
            rows.append([ln])
    return rows


def _is_toc_chrome(text: str, font_size: float, y: float, page_height: float | None = None) -> bool:
    t = text.strip()
    if not t:
        return True
    if TOC_HEADING_RE.match(t):
        return False  # real heading, filtered elsewhere
    low = t.lower()
    if low in {"openai", "technical report"}:
        return True
    if low.startswith("openai –") or low.startswith("openai -"):
        return True
    if font_size <= 8.5 and len(t) < 60:
        return True
    if page_height and (y < page_height * 0.05 or y > page_height * 0.95):
        if len(t) < 80:
            return True
    return False


def parse_toc_entries(
    lines: list[Line],
    toc_pages: set[int],
    page_heights: dict[int, float] | None = None,
) -> list[tuple[str, int, int]]:
    """Parse printed TOC into (title, dest_page, level).

    Handles title + page-number on the same row (separate text boxes) and
    wrapped titles that continue on the next row without a page number.
    """
    entries: list[tuple[str, int, int]] = []
    pending_title: str | None = None

    for page in sorted(toc_pages):
        ph = page_heights.get(page) if page_heights else None
        page_lines = [
            ln
            for ln in lines
            if ln.page == page
            and not TOC_HEADING_RE.match(ln.text.strip())
            and not _is_toc_chrome(ln.text, ln.font_size, ln.y, ph)
        ]

        for row in _cluster_toc_rows(page_lines):
            row = sorted(row, key=lambda ln: ln.x)
            page_token = next(
                (ln for ln in reversed(row) if PAGE_NUM_RE.match(ln.text.strip())), None
            )
            title_parts = [
                ln.text.strip()
                for ln in row
                if (page_token is None or ln is not page_token)
                and ln.text.strip()
                and not PAGE_NUM_RE.match(ln.text.strip())
            ]
            raw = LEADER_DOTS_RE.sub(" ", " ".join(title_parts)).strip()
            raw = re.sub(r"\s+", " ", raw)

            if page_token is None:
                if raw and not TOC_ENTRY_START_RE.match(raw) and entries:
                    title, dest, level = entries[-1]
                    entries[-1] = (f"{title} {raw}".strip(), dest, level)
                elif raw and TOC_ENTRY_START_RE.match(raw):
                    pending_title = raw
                continue

            dest = int(page_token.text.strip())
            if pending_title:
                if raw and not TOC_ENTRY_START_RE.match(raw):
                    title = f"{pending_title} {raw}".strip()
                else:
                    title = raw or pending_title
                pending_title = None
            else:
                title = raw

            if title:
                m = INLINE_TOC_PAGE_RE.match(title)
                if m:
                    title = m.group("title").strip()
                    dest = int(m.group("page"))

            title = LEADER_DOTS_RE.sub(" ", title).strip()
            title = re.sub(r"\s+", " ", title)
            if not title or TOC_HEADING_RE.match(title):
                continue

            entries.append((title, dest, toc_entry_level(title)))

    return entries


def outline_from_toc(
    lines: list[Line],
    doc_title: str = "Document",
    max_levels: int = 6,
    page_heights: dict[int, float] | None = None,
) -> TopicNode | None:
    """Build topic tree from a printed Table of Contents when present."""
    toc_pages = find_toc_pages(lines)
    if not toc_pages:
        return None
    entries = parse_toc_entries(lines, toc_pages, page_heights=page_heights)
    if len(entries) < 2:
        return None

    root = TopicNode(title=doc_title, level=-1)
    stack: list[TopicNode] = [root]
    for title, dest_page, level in entries:
        depth = min(level, max_levels - 1)
        while len(stack) > 1 and stack[-1].level >= depth:
            stack.pop()
        node = TopicNode(title=title, level=depth, page=dest_page)
        stack[-1].children.append(node)
        stack.append(node)
    return root


def filter_out_toc_pages(lines: list[Line], toc_pages: set[int] | None = None) -> list[Line]:
    """Drop TOC pages from body-heading candidate scoring."""
    pages = toc_pages if toc_pages is not None else find_toc_pages(lines)
    if not pages:
        return lines
    return [ln for ln in lines if ln.page not in pages]


def tree_stats(node: TopicNode) -> dict[str, Any]:
    depths: list[int] = []
    count = 0

    def walk(n: TopicNode) -> None:
        nonlocal count
        if n.level >= 0:
            count += 1
            depths.append(n.level)
        for ch in n.children:
            walk(ch)

    walk(node)
    return {
        "node_count": count,
        "max_depth": (max(depths) + 1) if depths else 0,
        "levels_used": sorted(set(depths)),
    }


def format_tree(node: TopicNode, indent: int = 0) -> str:
    lines: list[str] = []
    if node.level >= 0:
        meta = []
        if node.page is not None:
            meta.append(f"p{node.page}")
        if node.font_size is not None:
            meta.append(f"{node.font_size:.1f}pt")
        if node.score is not None:
            meta.append(f"score={node.score:.1f}")
        suffix = f"  ({', '.join(meta)})" if meta else ""
        lines.append(f"{'  ' * indent}- {node.title}{suffix}")
        child_indent = indent + 1
    else:
        lines.append(f"# {node.title}")
        child_indent = 0
    for ch in node.children:
        lines.append(format_tree(ch, child_indent))
    return "\n".join(lines)


def line_to_dict(line: Line) -> dict[str, Any]:
    d = asdict(line)
    if line.number_path is not None:
        d["number_path"] = list(line.number_path)
    return d
