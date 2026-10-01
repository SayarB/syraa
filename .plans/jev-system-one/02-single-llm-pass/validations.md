# Validations: Phase 2 — Single LLM pass per turn

## Must pass
- [ ] Repo checks green — check: `npm run check` at repo root exits 0.
- [ ] Tests green — check: `npm run test -w @syraa/harness` exits 0.
- [ ] One LLM call per turn — check: `grep -rn "structuredOutput" packages/harness/src` returns nothing; `packages/harness/src/mastra/structured-turn.ts` does not exist.
- [ ] Footer strip — check: unit tests in `resolve-turn.test.ts`: `"Answer.\n\n---\n*Working memory updated*"` → `"Answer."`; `"Answer.\n**Lesson extracted:** x"` → `"Answer."`; `"Part A\n---\nPart B"` unchanged; empty text → tool-cache fallback message.
- [ ] Prompt no longer mentions lessons or a message field — check: `grep -n "Lessons\|lessons\|open_loop\|message field" packages/harness/src/mastra/prompt.ts` returns nothing; the footer ban list is still present (grep `Working memory updated`).
- [ ] `displayMessage` is the stripped text — check: `chat.ts` `pipeChatStream` returns `displayMessage: turn.message` where `turn` comes from `resolveTurnFromStreamOutput` (code read) and the resolve-turn unit tests above pass.
- [ ] Old JSON-body threads still render — check: existing `thread-ui-messages` / threads tests pass unchanged (`extractDisplayText` untouched).
- [ ] **Phase 1 still holds** — check: `tests/lesson-gate.test.ts` passes unchanged; `TYPESAFE_API_KEY=… npm run eval:lesson-gate -w @syraa/harness` exits 0 (≥ 175/183 acceptable, 0 wrong auto); `grep -rn "filterLessonsForTurn\|shouldAutoActivate" packages/harness/src` still empty.
- [ ] Manual smoke (local, with keys) — check: 10 varied turns in the web app (incl. 2 that use materials tools and 1 "from now on …"): no reply ends with a runtime footer after `displayMessage` patch; the "from now on" turn still creates an active memory item. Record in the review report.

## Negative checks
- [ ] No cleaner pass added — check: no new `Agent` or LLM/Jev call in `resolve-turn.ts` / `chat-stream.ts` (code read + `grep -n "generate(\|api.typesafe.ai" packages/harness/src/mastra/resolve-turn.ts packages/harness/src/mastra/chat-stream.ts` empty).
- [ ] No web changes — check: `git diff <phase-1 merge>..HEAD --stat -- apps/web` is empty.
- [ ] Dead schema gone — check: `grep -rn "turnResultSchema\|parseTurnJson\|turnResultJsonSchema" packages apps --include=*.ts` (excl. node_modules/dist) returns nothing.
- [ ] `zod-to-json-schema` removed only if unused — check: if still in `packages/harness/package.json`, a remaining import exists (grep); if removed, no import exists.
