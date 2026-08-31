#!/usr/bin/env python3
"""Algorithmic PDF → topic tree (no LLM / VLM).

Priority:
  1. Embedded PDF bookmarks
  2. Printed Table of Contents (parsed from text + layout)
  3. Body heading heuristics (font size / numbering; TOC pages skipped)

Examples:
  python -m everyday_ingest.heading_heuristics.algo_outline test.pdf
  python -m everyday_ingest.heading_heuristics.algo_outline test.pdf --force toc -o out/algo.json
  python -m everyday_ingest.heading_heuristics.algo_outline test.pdf --force heuristics --show-tree
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from everyday_ingest.heading_heuristics.heuristics import (
    TopicNode,
    assign_levels_by_font,
    body_font_size,
    build_tree,
    extract_lines,
    filter_out_toc_pages,
    find_toc_pages,
    format_tree,
    outline_from_bookmarks,
    outline_from_toc,
    parse_toc_entries,
    score_lines,
    select_candidates,
    tree_stats,
)
from everyday_ingest.paths import REPO_ROOT


def dict_to_node(d: dict) -> TopicNode:
    node = TopicNode(
        title=d["title"],
        level=d["level"],
        page=d.get("page"),
        font_size=d.get("font_size"),
        score=d.get("score"),
        number_path=tuple(d["number_path"]) if d.get("number_path") else None,
    )
    node.children = [dict_to_node(c) for c in d.get("children", [])]
    return node


def run_algo(
    pdf: Path, *, force: str = "auto", min_score: float = 4.0, max_levels: int = 6
) -> dict:
    import pymupdf

    doc = pymupdf.open(pdf)
    try:
        title = (doc.metadata or {}).get("title") or pdf.stem
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

        if force == "bookmarks":
            chosen, source = bookmark_tree, "bookmarks"
        elif force == "toc":
            chosen, source = toc_tree, "toc"
        elif force == "heuristics":
            chosen, source = heuristic_tree, "heuristics"
        else:
            if bookmark_tree and bookmark_tree.children:
                chosen, source = bookmark_tree, "bookmarks"
            elif toc_tree and toc_tree.children:
                chosen, source = toc_tree, "toc"
            else:
                chosen, source = heuristic_tree, "heuristics"

        if chosen is None or not chosen.children:
            chosen, source = heuristic_tree, "heuristics"

        return {
            "method": "algorithmic",
            "pdf": str(pdf),
            "source": source,
            "force": force,
            "toc_pages": sorted(toc_pages),
            "toc_entry_count": len(toc_entries),
            "stats": tree_stats(chosen),
            "tree": chosen.to_dict(),
        }
    finally:
        doc.close()


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Algorithmic PDF topic-tree extractor")
    p.add_argument("pdf", type=Path)
    p.add_argument(
        "--force",
        choices=["auto", "bookmarks", "toc", "heuristics"],
        default="auto",
        help="Force a single algorithmic source (default: auto priority)",
    )
    p.add_argument("--min-score", type=float, default=4.0)
    p.add_argument("--max-levels", type=int, default=6)
    p.add_argument("--show-tree", action="store_true", default=True)
    p.add_argument("--quiet-tree", action="store_true", help="Do not print tree")
    p.add_argument("--json", action="store_true")
    p.add_argument("-o", "--out", type=Path, default=None)
    args = p.parse_args(argv)

    if not args.pdf.exists():
        print(f"Not found: {args.pdf}", file=sys.stderr)
        return 1

    result = run_algo(
        args.pdf, force=args.force, min_score=args.min_score, max_levels=args.max_levels
    )

    out = args.out or (REPO_ROOT / "out" / f"{args.pdf.stem}.algo.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(f"Wrote {out}")

    if args.json:
        print(json.dumps(result, indent=2))
        return 0

    print(f"Method: algorithmic  source={result['source']}  force={result['force']}")
    print(f"TOC pages: {result['toc_pages']}  stats: {result['stats']}")
    if not args.quiet_tree:
        print()
        print(format_tree(dict_to_node(result["tree"])))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
