---
name: Daily review
enabled: true
mode: report
timezone: UTC
timeout_minutes: 10
notify: findings
outputs:
  report: report.md
---

This is a minimal plumbing test for Cimmy — do nothing else.

1. Open `packages/ingest/src/protocol.ts`.
2. Find the function `ingestJobKey`.
3. Write `/out/report.md` containing **only** that function’s source code (the full `export function ingestJobKey…` block), inside a single TypeScript fenced code block.
4. Do not add commentary, headings, file paths, or any other text outside that code block.
5. Do not modify the repository.
