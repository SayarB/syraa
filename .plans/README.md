# .plans — phase plans, validations, review reports

Working folder for feature delivery (brainstorm → plan → validations → build → review).
Long-lived design notes live in [`../plans/`](../plans/).

## Status (2026-09-24)

| Folder | What | Status |
|---|---|---|
| `semantic-retrieve/` | `search_materials` tool (hybrid lexical + semantic) | Built, review pass; ships in PR #1. Manual chat replay A1–A3 not run (no provider keys). |
| `jev-system-one/` | Jev lesson gate (phase 1) + single LLM pass per turn (phase 2) | Built, review pass; PR #1 went through 5 more code-review rounds (triage in PR comments). In-app smoke not run (no chat key / DB on the build machine). |
| `document-parsing/` | LiteParse parse layer, (page, y) slicing, Jev heading adjudication + chunk roles | **Brainstorm only.** Next: architect writes phases/plan/validations (no PRD pass — brainstorm is enough). |

### Open PRs and merge order

1. **#1** `jev-lesson-gate` → `main`: search_materials, lesson gate, single LLM pass, review fixes.
2. **#4** `fix-lint-baseline` (stacked on #1): makes `npm run check` / CI pass. GitHub retargets it to `main` after #1.
3. **#3** `fix-worker-embedding-env`: blank embedding env vars in the worker. CI goes green once `main` has #4.
4. **#2** `track-plans` (this folder). CI goes green once `main` has #4.

Before merging #1: run the in-app smoke from its PR description (needs a chat key + Postgres/Redis).

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
