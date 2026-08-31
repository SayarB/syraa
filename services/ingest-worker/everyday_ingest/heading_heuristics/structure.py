"""Resolve document structure: bookmarks → printed TOC → body heuristics."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from everyday_ingest.heading_heuristics.heuristics import (
    TopicNode,
    assign_levels_by_font,
    body_font_size,
    build_tree,
    extract_lines,
    filter_out_toc_pages,
    find_toc_pages,
    outline_from_bookmarks,
    outline_from_toc,
    parse_toc_entries,
    score_lines,
    select_candidates,
    tree_stats,
)


def extract_structure(
    pdf: Path,
    *,
    source_mode: str = "auto",
    min_score: float = 4.0,
    max_levels: int = 6,
) -> dict[str, Any]:
    import pymupdf

    doc = pymupdf.open(pdf)
    try:
        title = (doc.metadata or {}).get("title") or pdf.stem
        page_count = doc.page_count
        page_heights = {i + 1: float(page.rect.height) for i, page in enumerate(doc)}
        lines = extract_lines(doc)
        toc_pages = find_toc_pages(lines)
        toc_entries = (
            parse_toc_entries(lines, toc_pages, page_heights=page_heights) if toc_pages else []
        )

        bookmark_tree = outline_from_bookmarks(doc)
        toc_tree = outline_from_toc(
            lines, doc_title=title, max_levels=max_levels, page_heights=page_heights
        )

        body_lines = filter_out_toc_pages(lines, toc_pages)
        body = body_font_size(body_lines)
        score_lines(body_lines, body_size=body, page_heights=page_heights)
        candidates = select_candidates(body_lines, min_score=min_score)
        assign_levels_by_font(candidates, max_levels=max_levels)
        heuristic_tree = build_tree(candidates, doc_title=title)

        mode = source_mode
        if mode == "auto_no_bookmarks":
            if toc_tree and toc_tree.children:
                chosen, source = toc_tree, "toc"
            else:
                chosen, source = heuristic_tree, "heuristics"
        elif mode == "bookmarks":
            chosen, source = bookmark_tree, "bookmarks"
        elif mode == "toc":
            chosen, source = toc_tree, "toc"
        elif mode == "heuristics":
            chosen, source = heuristic_tree, "heuristics"
        else:
            if bookmark_tree and bookmark_tree.children:
                chosen, source = bookmark_tree, "bookmarks"
            elif toc_tree and toc_tree.children:
                chosen, source = toc_tree, "toc"
            else:
                chosen, source = heuristic_tree, "heuristics"

        if chosen is None or not getattr(chosen, "children", None):
            if mode in {"bookmarks", "toc"} and heuristic_tree.children or chosen is None:
                chosen, source = heuristic_tree, "heuristics"

        assert chosen is not None
        return {
            "pdf": str(pdf),
            "title": title,
            "page_count": page_count,
            "source": source,
            "source_mode": mode,
            "toc_pages": sorted(toc_pages),
            "toc_entry_count": len(toc_entries),
            "body_font_size": body,
            "stats": tree_stats(chosen),
            "tree": chosen,
        }
    finally:
        doc.close()


def extract_structure_tree(
    pdf: Path,
    *,
    source_mode: str = "auto",
    min_score: float = 4.0,
    max_levels: int = 6,
) -> tuple[TopicNode, dict[str, Any]]:
    """Return (tree, meta)."""
    result = extract_structure(
        pdf, source_mode=source_mode, min_score=min_score, max_levels=max_levels
    )
    tree: TopicNode = result.pop("tree")
    return tree, result
