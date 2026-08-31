#!/usr/bin/env python3
"""Ingest a PDF into topics + bridge/leaf chunks (JSON artifact).

Example:
  python -m everyday_ingest.cli test.pdf -o out/test-ingest.json
  python -m everyday_ingest.cli test.pdf --source toc --pretty
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from everyday_ingest.pipeline import ingest_pdf


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Everyday feasibility PDF ingest → JSON")
    p.add_argument("pdf", type=Path, help="Path to PDF")
    p.add_argument(
        "-o",
        "--out",
        type=Path,
        default=None,
        help="Output JSON path (default: out/<stem>-ingest.json)",
    )
    p.add_argument(
        "--source",
        choices=["auto", "bookmarks", "toc", "heuristics"],
        default="auto",
        help="Structure source (default auto)",
    )
    p.add_argument(
        "--no-bookmarks",
        action="store_true",
        help="Skip embedded bookmarks (printed TOC then heuristics)",
    )
    p.add_argument("--min-score", type=float, default=4.0)
    p.add_argument("--max-levels", type=int, default=6)
    p.add_argument(
        "--leaf-chars",
        type=int,
        default=1800,
        help="Target character size for leaf chunk splits",
    )
    p.add_argument(
        "--pretty",
        action="store_true",
        help="Also print a short human summary",
    )
    args = p.parse_args(argv)

    if not args.pdf.exists():
        print(f"File not found: {args.pdf}", file=sys.stderr)
        return 1

    source_mode = args.source
    if args.no_bookmarks and source_mode == "auto":
        source_mode = "auto_no_bookmarks"

    result = ingest_pdf(
        args.pdf,
        source_mode=source_mode,
        min_score=args.min_score,
        max_levels=args.max_levels,
        leaf_target_chars=args.leaf_chars,
    )

    out = args.out or Path("out") / f"{args.pdf.stem}-ingest.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2, ensure_ascii=False))
    print(f"Wrote {out}")

    m = result["meta"]
    print(
        f"source={result['resource']['structure_source']}  "
        f"topics={m['topic_count']}  chunks={m['chunk_count']} "
        f"(bridge={m['bridge_count']}, leaf={m['leaf_count']})"
    )

    if args.pretty:
        print("\n# topics")
        for t in result["topics"]:
            if t["level"] < 0:
                continue
            pad = "  " * max(t["depth"] - 1, 0)
            print(f"{pad}- [{t['id'][:8]}] {t['title'][:70]}  p{t['page_start']}-{t['page_end']}")
        print("\n# sample chunks")
        for c in result["chunks"][:8]:
            preview = c["text"][:100].replace("\n", " ")
            print(
                f"  {c['role']:6} parent={c['parent_topic_id'][:8]} "
                f"child={str(c['child_topic_id'])[:8] if c['child_topic_id'] else None} "
                f"tok≈{c['token_estimate']}: {preview}…"
            )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
