# Review report: Phase 2 — Single LLM pass per turn
**Verdict:** pass
**Round:** 1
**Phase:** `02-single-llm-pass`
**Another implementor round needed:** no

Branch `jev-lesson-gate`, on top of phase-1 commit. Reviewed 2026-09-21.

## Checklist vs validations
| Item | Result | Notes |
|------|--------|-------|
| `npm run check` exits 0 | **not met — pre-existing** | 27 errors / 4 warnings vs 30 / 4 at the phase-1 commit (removed files carried 3). No new diagnostics. Same baseline issue as phase 1. |
| Harness tests green | pass | 9 files, 67 tests. |
| One LLM call per turn | pass | `grep structuredOutput src` empty; `structured-turn.ts` deleted. |
| Footer strip | pass | `resolve-turn.test.ts` table: `---\n*Working memory updated*`, `**Lesson extracted:** x`, `_Memory updated_` → stripped; `Part A\n---\nPart B` unchanged; empty text → tool-cache fallback; footer-only → retry message. |
| Prompt clean | pass | grep for `Lessons\|lessons\|open_loop\|message field` empty; footer ban list still present. |
| `displayMessage` = stripped text | pass | `chat.ts:169` `displayMessage: turn.message`, `turn` from `resolveTurnFromStreamOutput` (`chat-stream.ts:61`). |
| Old JSON-body threads render | pass | `extractDisplayText` untouched; thread tests pass. |
| Phase 1 still holds | pass | `lesson-gate.test.ts` unchanged and green; live eval **179/183, 0 wrong auto** (misses A05, F06, P03, T07 — known borderline, Jev score jitter vs 180 earlier); regex-gating grep empty. |
| Manual smoke (10 turns in web app) | **not run** | No chat key / Postgres / Redis on this machine. User to run. |
| Neg: no cleaner pass | pass | No `generate(` / `api.typesafe.ai` in `resolve-turn.ts` / `chat-stream.ts`. |
| Neg: no web changes | pass | `apps/web` diff empty. |
| Neg: dead schema gone | pass | grep empty across packages/apps. |
| Neg: `zod-to-json-schema` | pass | Removed from `packages/harness/package.json`; no import remains; lockfile edited surgically (only its entries — `npm uninstall` also rewrote unrelated `peer`/`dev` flags, so that was reverted). |

## Findings
### Blocking
None.

### Non-blocking
- **Plan's footer regex had a bug** — its trailing `\b` fails on italic `_Memory updated_` (no word boundary between `d` and `_`). Implemented with `(?![a-z0-9])` instead; covered by a test.
- **Footer-only reply** → streamed text shows the footer, then `displayMessage` swaps in "I couldn't finish that turn — please try again." Rare; acceptable.
- **Mastra Memory still stores the raw (unstripped) assistant text**, so a leaked footer would reach thread history and the phase-1 Jev state via `lastAssistantMessageText`. Unchanged from before this phase; mention if footers show up in smoke.

## Extra vs plan
- `tests/schemas.test.ts` **deleted** rather than edited: every case in it tested `parseTurnJson` / `turnResultSchema`; an empty file would fail vitest. Deviation noted, not scope growth.
- `confidenceSchema` removed (plan: "if unused") — it was only used by `lessonSchema`.

## Summary
The structuring pass is gone: one LLM call per turn, the streamed text is the reply, footers are stripped in code, the prompt no longer talks about lessons or a message field, and dead schema code + one dependency were removed. Phase 1's gate is untouched and still passes its live eval. Only outstanding item is the in-app smoke test, which needs keys and a database.
