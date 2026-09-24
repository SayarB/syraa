# Validations: Phase 1 — Jev lesson gate

## Must pass
- [ ] Repo checks green — check: `npm run check` at repo root exits 0 (Biome + tsc + ruff).
- [ ] Tests green — check: `npm run test -w @syraa/harness` exits 0; `tests/lesson-gate.test.ts` exists and runs.
- [ ] Band rule matches the frozen eval rule — check: unit test table in `lesson-gate.test.ts`: (strict 0.81, reveals 0.92, explicit) → `auto`; (0.33, 0.85, implicit) → `pending`; (0.78, 0.34, explicit) → `drop` (quoted-email shape); (0.02, 0.07, none) → `drop`; (0.55, 0.55, implicit) → `pending`.
- [ ] Shipped questions are the eval questions — check: `LESSON_GATE_QUESTIONS.strict`, `.reveals`, `.explicitness` instructions/criteria are string-identical to `.plans/jev-system-one/eval/run3.ts` `QUESTIONS` (diff the extracted strings).
- [ ] Live eval passes with the shipped 5-question call — check: `TYPESAFE_API_KEY=… npm run eval:lesson-gate -w @syraa/harness` exits 0, reports ≥ 175/183 acceptable and **0** wrong auto-activations; paste the summary into the review report.
- [ ] Code blocks never reach Jev — check: unit test asserts the `state` sent to the mocked `fetch` for a message with a fenced block contains no text from inside the fence (incl. an unterminated fence).
- [ ] Fail closed — check: unit tests: `TYPESAFE_API_KEY` unset → `gateLesson` resolves `[]` and `fetch` not called; fetch returns 500 → `[]`; fetch rejects (abort/timeout) → `[]`; response missing `answers.reveals` → `[]`; writer returns `null` → `[]`. None of these reject.
- [ ] Verbatim vs writer path — check: unit tests: single-sentence kept message with `self_contained` 0.9 → lesson `text` equals the message, writer `generate` not called; multi-sentence kept message whose top sentence has `self_contained` 0.2 → writer called once with `focus` = that sentence, lesson `text` = writer output.
- [ ] Activation comes from the gate — check: unit test on `applyLessons` with a fake `MemoryService`: `activate: true` → `createItem` called with `status: "active"`, `needsConfirm: false`, `source: "explicit"`; `activate: false` → `status: "pending"`, `needsConfirm: true`, `source: "distilled"`.
- [ ] Gate runs in parallel with the reply — check: in `src/chat.ts`, `gateLesson(` is called inside `prepareChatTurn` (before `runChatTurn` / `createSyraaUIMessageStream`), and its promise is awaited only where `applyLessons` is called (grep).
- [ ] Both chat paths use the gate, not structurer lessons — check: `grep -n "turn.lessons" packages/harness/src/chat.ts` returns nothing; both `applyLessons(` calls pass `lessons` from `prepared.lessonGate`.
- [ ] Previous assistant message is in the Jev state — check: unit test with mocked `lastAssistantMessageText` returning `"Want me to keep answers short going forward?"` asserts the fetched `state` contains it; with `null` it contains `(none — start of conversation)`.
- [ ] Env documented — check: `.env.example` contains `TYPESAFE_API_KEY`; `compose.yaml` api service `environment` contains `TYPESAFE_API_KEY: ${TYPESAFE_API_KEY:-}`.
- [ ] Manual smoke (local, with keys) — check: in the web app, send "From now on, answer in bullet points." → memory dropdown shows an **active** item; send "I'm colour-blind, red-green. Pick a palette for 5 chart categories." → a **pending** item; send "Why does my React effect always run twice in dev?" → no new item. Record results in the review report.

## Negative checks
- [ ] No regex gating left — check: `grep -rn "EXPLICIT_MARKERS\|ONE_OFF_TASK_QUERY\|filterLessonsForTurn\|shouldAutoActivate" packages/harness/src` returns nothing.
- [ ] No new dependency — check: `git diff main -- packages/harness/package.json package-lock.json` shows only the added `eval:lesson-gate` script (no `dependencies` / `devDependencies` changes).
- [ ] No shared Jev client module — check: no `packages/harness/src/jev.ts` (or similar) file exists; `api.typesafe.ai` appears only in `src/lesson-gate.ts` (grep).
- [ ] Domain packages stay Mastra/Jev-free — check: `grep -rn "typesafe\|lesson-gate\|@mastra" packages/memory packages/context packages/ingest --include=*.ts` (excluding node_modules/dist) returns nothing new.
- [ ] Eval is opt-in — check: `packages/harness/vitest.config.ts` include is still `tests/**/*.test.ts`; `npm run test` makes no request to `api.typesafe.ai` (run with `TYPESAFE_API_KEY` unset and confirm pass).
- [ ] Phase-2 files untouched — check: `git diff main --stat` shows no changes to `src/mastra/structured-turn.ts`, `src/mastra/resolve-turn.ts`, `src/mastra/prompt.ts`, `apps/web/`.
