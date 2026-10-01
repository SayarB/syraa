# .plans — phase plans, validations, review reports

Working folder for feature delivery (brainstorm → plan → validations → build → review).
Long-lived design notes live in [`../plans/`](../plans/).

## Status (2026-10-01)

| Folder | What | Status |
|---|---|---|
| `semantic-retrieve/` | `search_materials` tool (hybrid lexical + semantic) | Merged in PR #1. Manual chat replay A1–A3 not run. |
| `jev-system-one/` | Jev lesson gate (phase 1) + single LLM pass per turn (phase 2) | Merged in PR #1. In-app smoke not run. |
| `document-parsing/` | LiteParse parse layer, (page, y) slicing, Jev heading adjudication + chunk roles | **Brainstorm only.** Next: architect writes phases/plan/validations (no PRD pass — brainstorm is enough). |

### Merged PRs

- **#1** search_materials, Jev lesson gate, single LLM pass per chat turn.
- **#3** Worker: blank embedding env vars are treated as unset.
- **#5** Tailwind + shadcn/ui + AI Elements with Soft Layers themes; fixed the repo-wide Biome baseline (CI green).
- **#6** Memory is written only from user messages, not assistant replies or old thread history.
- **#7** Web search: self-hosted SearXNG + `web_search` tool with citations.
- **#8** Page reading: self-hosted Crawl4AI + `web_fetch` tool.
- **#2** Track `.plans` in git (this folder).
- Closed unmerged: **#4** lint baseline (superseded by #5).

### Not built yet

- Chat event persistence: upload, memory-saved and thread-created lines vanish when a chat is reopened (they live only in web state; the "Ready" line comes from `pollIngestJob` in `apps/web/src/App.tsx`). Agreed design (2026-09-07): one unified message interface, events not model-visible, one server-side item per document ("Uploaded X", later filled with topic/chunk counts), no "queued" state.

### Follow-ups raised in review (not done)

- pgvector + a per-chunk embedding-model column (replaces dims-as-identity; run lexical and semantic in parallel).
- Mark hash-fallback ingests for re-embedding instead of silently storing stubs.
- Lesson gate: don't hold the stream open for the gate; an "already in memory?" Jev question to stop reworded duplicates.
- `exactMatch` = all query terms, not any.
- `handleChatStream` refactor: shared turn options with `llm.ts`, `finish` chunk ordering.
- Web: auto-scroll only when near the bottom; a test runner for `apps/web`.

## Not started (plans in `../plans/`)

- `prompt-composition.md` — three-part system prompt assembly (draft).
- `one-core-many-fronts.md` — Phase A: extract turn core (draft; Phase C needs product green-light).
- `mastra-first.md` deferred follow-ups — Mastra processors for memory pack, Observability/Studio, `handleChatStream` refactor.
- `semantic-retrieve.md` follow-up — pgvector for semantic candidates.
- `jev-system-one/brainstorm.md` parked parts — materials retrieve escalate/skip, memory pack gating, draft guardrail, model routing.

## Layout

- `<feature>/brainstorm.md` — living notes.
- `<feature>/phases.md` — phase split (when a feature has phases).
- `<feature>/<NN-phase>/plan.md`, `validations.md`, `review-report.md` — one folder per phase.
- `<feature>/eval/` — throwaway eval scripts and raw results kept for reference.
