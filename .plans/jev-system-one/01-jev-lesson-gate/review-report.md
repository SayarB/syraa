# Review report: Phase 1 — Jev lesson gate
**Verdict:** pass
**Round:** 2
**Phase:** `01-jev-lesson-gate`
**Another implementor round needed:** no

Round 2 = implementor addressed round-1 non-blocking items; re-reviewed 2026-09-21.

## Round 2 changes
| Round-1 item | Result | Notes |
|---|---|---|
| Lesson writer has no timeout | fixed | `src/lesson-gate.ts` `writeLessonText` passes `abortSignal: AbortSignal.timeout(WRITER_TIMEOUT_MS)` (5 s). New test "gives the writer a timeout and fails closed when it aborts" asserts an `AbortSignal` is passed and a `TimeoutError` resolves `[]`. |
| Third-party data flow undocumented | fixed | `.env.example` now says each user turn + previous assistant reply (≤2,000 chars) goes to TypeSafe. |
| Burst of Jev calls / 429s | open (watch) | By design; monitor `[lesson-gate] skipped: jev HTTP 429` once live. |
| LLM-written text can auto-activate | open (accepted) | Within plan; same as prior behaviour. |
| `npm run check` validation mis-specified | accepted | Still 30 errors / 4 warnings = `main` baseline; no new diagnostics. |

## Re-checked validations
- Tests: `npm run test -w @syraa/harness` → 9 files, **66** passed. `tsc --noEmit` on harness clean; Biome clean on touched files.
- Live eval re-run: **180/183 acceptable, 174 exact, 0 wrong auto** (r1 37/37, r2 26/26, r3 97/100, r4 20/20). Misses F06, P03, T07 (known borderline). PASS.
- All other round-1 rows unchanged (no other code touched).
- Manual in-app smoke: **still not run** — no chat key (`FIREWORKS_API_KEY`/`OPENAI_API_KEY`) and no Postgres/Redis on this machine. Needs to be run by the user once available.

## Findings
### Blocking
None.
### Non-blocking
- In-app smoke outstanding (environment).

---

# Round 1 (archived)

# Review report: Phase 1 — Jev lesson gate
**Verdict:** pass
**Round:** 1
**Phase:** `01-jev-lesson-gate`
**Another implementor round needed:** no (3 rounds remain for this phase if the user wants the non-blocking items addressed)

Branch `jev-lesson-gate` (local, not pushed), uncommitted. Reviewed 2026-09-21.

## Checklist vs validations
| Item | Result | Notes |
|------|--------|-------|
| `npm run check` exits 0 | **not met — pre-existing** | Fails on `main` too: 30 errors / 4 warnings with this change stashed (`git stash -u`), 30 / 4 with it applied. No new diagnostics. New files are Biome-clean (`npx biome check` on the 5 new files: 0). Failures are in `apps/web`, `harness/auth.ts`, `storage.ts`, `threads.ts` (pre-existing `useConst`, import order), older tests. Validation was mis-specified for this repo's baseline. |
| Harness tests green | pass | `npm run test -w @syraa/harness`: 9 files, 65 tests passed; `tests/lesson-gate.test.ts` 18 tests. Also passes with `TYPESAFE_API_KEY` unset. |
| Band rule matches frozen rule | pass | `lesson-gate.test.ts` `it.each` table has all 5 rows from validations incl. quoted-email → `drop`. |
| Shipped questions = eval questions | pass | String-identical (JSON compare): `strict`, `reveals`, `explicitness` vs `eval/run3.ts`; `kind`, `self_contained` vs `eval/run.ts`. |
| Live eval ≥ 175/183, 0 wrong auto | pass | `npm run eval:lesson-gate`: **179/183 acceptable, 173 exact, 0 wrong auto** (r1 37/37, r2 26/26, r3 96/100, r4 20/20). Misses: A05, F06, P03, T07 — all known borderline cases. N04 (code comment) now passes thanks to code stripping. |
| Code blocks never reach Jev | pass | State test asserts fenced content absent; unterminated fence covered by the `stripCodeBlocks` unit test (not by the state test itself — minor). |
| Fail closed (5 cases) | pass | Unit tests: no key (no fetch), HTTP 500, rejected fetch (TimeoutError), missing answer, writer returns empty. All resolve `[]`. |
| Verbatim vs writer path | pass | Single sentence + self 0.9 → verbatim, writer not called; 3-sentence message, top sentence self 0.2 → writer called once with `focus` = top sentence. |
| Activation comes from the gate | pass | `applyLessons` test with fake `MemoryService`: active/false/explicit vs pending/true/distilled. |
| Gate runs in parallel with the reply | pass | `chat.ts:117` starts `gateLesson` in `prepareChatTurn` before `listMemoryForUser`; awaited only at `chat.ts:58` and `chat.ts:156`, right before `applyLessons`. |
| No `turn.lessons` in chat paths | pass | grep empty. |
| Prev assistant message in state | pass | Unit test covers both the mocked message and `(none — start of conversation)`. |
| Env documented | pass | `.env.example` block after OpenAI; `compose.yaml` api `TYPESAFE_API_KEY: ${TYPESAFE_API_KEY:-}`. |
| Manual smoke in the web app | **partial** | App smoke **not run**: `.env` has no chat key (`FIREWORKS_API_KEY`/`OPENAI_API_KEY`) and no Postgres/Redis running. Substitute run: real `gateLesson` against live Jev (thread lookup stubbed): "From now on, answer in bullet points." → auto, verbatim; "I'm colour-blind, red-green specifically. Pick a palette…" → pending, text "I'm colour-blind, red-green specifically." (span pick, no writer); "Why does my React effect always run twice in dev?" → `[]`. **User should run the in-app smoke once keys + DB are available.** |
| Neg: no regex gating left | pass | grep empty. |
| Neg: no new dependency | pass | `package.json` diff = one script line; `package-lock.json` unchanged. |
| Neg: no shared Jev client module | pass | `api.typesafe.ai` only in `src/lesson-gate.ts`. |
| Neg: domain packages untouched | pass | grep over `packages/{memory,context,ingest}/src` empty. |
| Neg: eval is opt-in | pass | `vitest.config.ts` unchanged (`tests/**/*.test.ts`); tests pass with key unset. |
| Neg: phase-2 files untouched | pass | No diff in `structured-turn.ts`, `resolve-turn.ts`, `prompt.ts`, `apps/web`. |

## Findings
### Blocking
None.

### Non-blocking
- **Lesson writer has no timeout** — `src/lesson-gate.ts` `writeLessonText` calls `agent.generate` without an abort signal. In the stream path `onTurnComplete` awaits the gate before the `data-syraa-turn` part and stream close (`mastra/chat-stream.ts`), so a slow chat-model call on a keep turn holds the stream open. Jev calls are capped at 3 s each; the writer isn't. Suggest `abortSignal: AbortSignal.timeout(5000)` on the generate call (fail closed on abort).
- **Burst of Jev calls on long kept messages** — up to 1 + 12 parallel calls (`MAX_SCORED_SENTENCES`). A 429 on any sentence call drops the lesson (fail closed, by design). Watch the `[lesson-gate] skipped: jev HTTP 429` warnings once live; lower the cap if they appear.
- **New third-party data flow** — user messages and the previous assistant reply (≤ 2,000 chars) now go to TypeSafe on every turn, not only to the chat provider. The user chose this; worth one line in `.env.example` ("sends chat turns to TypeSafe") so operators know.
- **Auto-activated text can be LLM-written** — an explicit referential ask ("yes, do that every time") auto-activates the writer's paraphrase without confirmation. Same as the old structurer behaviour, and within plan, but it's the one path where generated text becomes active memory unseen.
- **Validation spec** — `npm run check exits 0` can't be met without fixing unrelated baseline issues; phase 2's validations have the same line. Suggest the architect restate it as "no new `npm run check` diagnostics vs `main`".

## Extra vs plan
- `src/lesson-gate.ts` `askJev` is **exported** (plan sketched it as internal) — needed so `evals/lesson-gate/run.ts` calls Jev exactly like production; keeps "shipped questions = eval questions" honest. Acceptable seam, not an extra module.
- `src/lesson-gate.ts` verbatim text is also capped at 240 chars (`MAX_LESSON_CHARS`), sending longer "self-contained" sentences to the writer — small guard, not in the plan's sketch. Keep or drop; non-blocking.
- `src/threads.ts` `lastAssistantMessageText` also sorts by `createdAt` in code — covers the plan's labelled assumption about recall ordering without a second query. In-plan intent.
- Otherwise none: no new deps, files match the File map, no helpers outside it.

## Summary
Phase 1 does what the plan says: Jev gates every chat turn in parallel with the reply, activation comes only from the frozen band rule, the regex filters and structurer lessons are gone from the memory path, and everything fails closed. The shipped 5-question call scores 179/183 on the live eval with no wrong auto-activations. No blocking findings. Two validations are not fully met for **environment** reasons, not code: the repo-wide lint baseline already fails on `main` (no new errors added), and the in-app smoke needs a chat key + database. The live gate smoke passed on all three messages. Recommended before merge: add the writer timeout, and run the in-app smoke.
