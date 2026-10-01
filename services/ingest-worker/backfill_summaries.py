"""Backfill AI summaries for documents ingested before summaries existed.

Finds ready documents whose card still has the pre-summary placeholder, summarises them from
their stored headings and text, and saves the result. Safe to re-run: each document is tried
once; --retry-empty also retries documents whose summary was skipped or failed before.

    python services/ingest-worker/backfill_summaries.py --dry-run
    python services/ingest-worker/backfill_summaries.py [--retry-empty] [--user ID] [--limit N]
"""

from __future__ import annotations

import argparse

from syraa_ingest.persist import (
    list_resources_needing_summary,
    load_summary_sources,
    update_card_summary,
)
from syraa_ingest.summarize import summarize_sources
from syraa_ingest.tracing import trace_backfill_summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true", help="list documents, change nothing")
    parser.add_argument("--user", help="only this user's documents")
    parser.add_argument("--limit", type=int, help="at most this many documents")
    parser.add_argument(
        "--retry-empty", action="store_true", help="also retry documents with no summary yet"
    )
    args = parser.parse_args()

    resources = list_resources_needing_summary(
        user_id=args.user, limit=args.limit, include_empty=args.retry_empty
    )
    print(f"{len(resources)} document(s) need a summary", flush=True)
    if args.dry_run:
        for resource in resources:
            print(f"  would summarise {resource['name']} ({resource['resource_id']})", flush=True)
        return

    counts = {"ok": 0, "skipped": 0}
    for resource in resources:
        sources = load_summary_sources(resource["resource_id"])
        with trace_backfill_summary(
            user_id=resource["user_id"], resource_id=resource["resource_id"]
        ):
            summary = summarize_sources(
                title=resource["title"] or "",
                file_name=resource["name"],
                topics=sources["topics"],
                chunks=sources["chunks"],
            )
        # "" = tried, no summary: re-runs skip it (unless --retry-empty) and the prompt falls
        # back to a few headings.
        update_card_summary(resource["resource_id"], summary or "")
        status = "ok" if summary else "skipped"
        counts[status] += 1
        print(f"  {status:<7} {resource['name']}", flush=True)

    print(f"done: {counts['ok']} summarised, {counts['skipped']} without summary", flush=True)


if __name__ == "__main__":
    main()
