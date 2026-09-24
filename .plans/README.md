# .plans — phase plans, validations, review reports

Working folder for feature delivery (brainstorm → plan → validations → build → review).
Long-lived design notes live in [`../plans/`](../plans/).

## Status (2026-09-24)

| Folder | What | Status |
|---|---|---|
| `semantic-retrieve/` | `search_materials` tool (hybrid lexical + semantic) | Shipped on `main` (review pass, round 2). Manual chat replay A1–A3 not run (no provider keys). |
| `jev-system-one/` | Jev lesson gate (phase 1) + single LLM pass per turn (phase 2) | Built, review pass; PR #1 (`jev-lesson-gate`). In-app smoke not run (no chat key / DB on the build machine). |
| `document-parsing/` | LiteParse parse layer, (page, y) slicing, Jev heading adjudication + chunk roles | **Brainstorm only.** Next: architect writes phases/plan/validations (no PRD pass — brainstorm is enough). |

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
