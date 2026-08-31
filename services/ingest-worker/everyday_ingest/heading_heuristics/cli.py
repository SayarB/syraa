#!/usr/bin/env python3
"""CLI: extract a topic tree from a PDF via bookmarks, printed TOC, or heading heuristics.

Priority (auto): embedded bookmarks → printed Table of Contents → body heuristics.

Examples:
  python -m everyday_ingest.heading_heuristics.cli fixtures/pdfs/sample.pdf
  python -m everyday_ingest.heading_heuristics.cli test.pdf --source toc
  python -m everyday_ingest.heading_heuristics.cli test.pdf --no-bookmarks -o out/tree.json
  python -m everyday_ingest.heading_heuristics.cli --make-sample fixtures/pdfs/sample.pdf
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
    line_to_dict,
    outline_from_bookmarks,
    outline_from_toc,
    parse_toc_entries,
    score_lines,
    select_candidates,
    tree_stats,
)


def make_sample_pdf(path: Path) -> None:
    import pymupdf

    path.parent.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open()
    page = doc.new_page()
    y = 72
    blocks = [
        ("Biology 101 Syllabus", 24, True),
        ("1 Course overview", 18, True),
        ("This course covers cells, genetics, and ecology.", 11, False),
        ("1.1 Learning outcomes", 14, True),
        ("Students will explain mitosis and meiosis.", 11, False),
        ("1.2 Grading", 14, True),
        ("Quizzes 20%. Midterm 30%. Final 50%.", 11, False),
        ("2 Cell biology", 18, True),
        ("2.1 Organelles", 14, True),
        ("Mitochondria, nucleus, ribosomes.", 11, False),
        ("2.2 Mitosis", 14, True),
        ("Prophase, metaphase, anaphase, telophase.", 11, False),
        ("3 Genetics", 18, True),
        ("3.1 Meiosis", 14, True),
        ("Reduction division and crossing over.", 11, False),
    ]
    for text, size, bold in blocks:
        font = "Helvetica-Bold" if bold else "Helvetica"
        page.insert_text((72, y), text, fontsize=size, fontname=font)
        y += size + 10
        if y > 700:
            page = doc.new_page()
            y = 72
    doc.save(path)
    doc.close()


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


def run(
    pdf: Path,
    min_score: float,
    max_levels: int,
    source_mode: str,
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

        # Body heuristics: ignore printed TOC pages so they don't pollute candidates
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
            # auto: bookmarks → printed TOC → heuristics
            if bookmark_tree and bookmark_tree.children:
                chosen, source = bookmark_tree, "bookmarks"
            elif toc_tree and toc_tree.children:
                chosen, source = toc_tree, "toc"
            else:
                chosen, source = heuristic_tree, "heuristics"

        if chosen is None or not getattr(chosen, "children", None):
            if mode in {"bookmarks", "toc"} and heuristic_tree.children or chosen is None:
                chosen, source = heuristic_tree, "heuristics"

        return {
            "pdf": str(pdf),
            "source": source,
            "source_mode": mode,
            "toc_pages": sorted(toc_pages),
            "toc_entry_count": len(toc_entries),
            "toc_entries": [{"title": t, "page": p, "level": lvl} for t, p, lvl in toc_entries],
            "body_font_size": body,
            "line_count": len(lines),
            "candidate_count": len(candidates),
            "min_score": min_score,
            "stats": tree_stats(chosen),
            "tree": chosen.to_dict(),
            "bookmark_tree": bookmark_tree.to_dict() if bookmark_tree else None,
            "toc_tree": toc_tree.to_dict() if toc_tree else None,
            "heuristic_tree": heuristic_tree.to_dict(),
            "candidates": [
                line_to_dict(c) for c in sorted(candidates, key=lambda c: (c.page, c.y))
            ],
            "all_lines": [line_to_dict(c) for c in lines],
        }
    finally:
        doc.close()


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="PDF heading-heuristics feasibility tool")
    p.add_argument("pdf", nargs="?", type=Path, help="Path to PDF")
    p.add_argument("--min-score", type=float, default=4.0, help="Candidate score threshold")
    p.add_argument("--max-levels", type=int, default=6, help="Soft max topic depth")
    p.add_argument(
        "--source",
        choices=["auto", "bookmarks", "toc", "heuristics"],
        default="auto",
        help="Structure source (default: auto = bookmarks → printed TOC → heuristics)",
    )
    p.add_argument(
        "--no-bookmarks",
        action="store_true",
        help="Skip embedded bookmarks; use printed TOC then heuristics",
    )
    p.add_argument("--candidates", action="store_true", help="Print scored heading candidates")
    p.add_argument(
        "--dump-lines", action="store_true", help="Print every extracted line with score"
    )
    p.add_argument("--show-toc", action="store_true", help="Print parsed TOC entries")
    p.add_argument("--json", action="store_true", help="Emit JSON")
    p.add_argument("-o", "--out", type=Path, help="Write JSON result to file")
    p.add_argument(
        "--make-sample",
        type=Path,
        metavar="PATH",
        help="Write a synthetic multi-heading PDF and exit",
    )
    args = p.parse_args(argv)

    if args.make_sample:
        make_sample_pdf(args.make_sample)
        print(f"Wrote sample PDF → {args.make_sample}")
        return 0

    if not args.pdf:
        p.error("pdf is required (or use --make-sample)")

    if not args.pdf.exists():
        print(f"File not found: {args.pdf}", file=sys.stderr)
        return 1

    source_mode = args.source
    if args.no_bookmarks and source_mode == "auto":
        source_mode = "auto_no_bookmarks"

    result = run(
        args.pdf,
        min_score=args.min_score,
        max_levels=args.max_levels,
        source_mode=source_mode,
    )

    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        slim = dict(result)
        if not args.dump_lines:
            slim.pop("all_lines", None)
        args.out.write_text(json.dumps(slim, indent=2))
        print(f"Wrote {args.out}")

    if args.json:
        out = dict(result)
        if not args.dump_lines:
            out.pop("all_lines", None)
        if not args.candidates:
            out.pop("candidates", None)
        print(json.dumps(out, indent=2))
        return 0

    print(f"PDF: {result['pdf']}")
    print(f"Source: {result['source']} (mode={result['source_mode']})")
    print(f"TOC pages: {result['toc_pages']}  entries: {result['toc_entry_count']}")
    print(f"Body font ≈ {result['body_font_size']:.1f}pt")
    print(f"Lines: {result['line_count']}  body candidates: {result['candidate_count']}")
    print(f"Stats: {result['stats']}")
    print()
    print(format_tree(dict_to_node(result["tree"])))

    if args.show_toc:
        print("\n--- parsed TOC entries ---")
        for e in result["toc_entries"]:
            print(f"L{e['level']} → p{e['page']}: {e['title']}")

    if args.candidates:
        print("\n--- body candidates (TOC pages excluded) ---")
        for c in result["candidates"]:
            print(
                f"p{c['page']} y={c['y']:.0f} {c['font_size']:.1f}pt "
                f"bold={c['bold']} score={c['score']:.1f} level={c['level']}: {c['text']}"
            )

    if args.dump_lines:
        print("\n--- all lines ---")
        for c in result["all_lines"]:
            print(f"p{c['page']} {c['font_size']:.1f}pt score={c['score']:.1f}: {c['text'][:100]}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
