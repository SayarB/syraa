---
name: Daily review
enabled: true
mode: report
timezone: UTC
timeout_minutes: 30
notify: findings
outputs:
  report: report.md
---

You are reviewing the **Syraa** codebase for architectural issues.

Workspace: `/work` · Repository: `/work/repo` · Write the report only to `/work/out/report.md`.
Do not modify files under `/work/repo`. Do not print secrets or `.env` contents. Do not git push.

## Scope

Syraa is roughly:

- `apps/api`, `apps/web` — API and web surfaces
- `packages/harness` — agent/chat harness (Mastra, tools, turns)
- `packages/memory` — user memory persistence
- `packages/context` — context store
- `packages/ingest` — ingest queue / Drive → worker protocol

Focus on **architecture and coupling**, not style nits or drive-by refactors.

## What to look for

1. **Boundary leaks** — packages importing across layers they should not; API leaking harness/db details to the client.
2. **Duplicated sources of truth** — same concept modeled in two packages without a clear owner.
3. **Fragile contracts** — Redis/queue payloads, DB schemas, or tool interfaces that can drift silently between Node and Python (or between packages).
4. **Missing failure boundaries** — places where a downed DB/queue/provider can cascade without isolation or clear errors.
5. **Auth / tenancy gaps** — user or scope IDs assumed but not enforced at a boundary.
6. **Operational risk** — long-lived handles, connection pools, or startup order assumptions that will hurt in production.

Skip trivial naming, formatting, and “add more tests” unless they point to a real architectural hole.

## Method

1. Skim README / package entrypoints and how apps wire packages together.
2. Trace 1–2 critical paths (e.g. chat turn → harness → memory/context; file ingest → queue → worker contract).
3. Spot concrete issues with file paths as evidence.
4. If nothing material, say so explicitly — do not invent problems.

## Report format (`/work/out/report.md`)

Use markdown:

```markdown
# Syraa architecture review

## Summary
2–4 sentences.

## Findings
### 1. <short title>
- **Severity:** high | medium | low
- **Where:** `path` (and related paths)
- **Issue:** …
- **Why it matters:** …
- **Suggestion:** …

(Repeat for each finding. Cap at ~8 strongest issues.)

## What’s sound
Brief bullets on boundaries or patterns that look intentional and healthy.

## Out of scope / not checked
Anything you did not have time or signal to verify.
```
