# Plan: Phase 2 — Single LLM pass per turn

Depends on phase 1 (`../01-jev-lesson-gate/`) being shipped and reviewed `pass`.

## Goal
Remove the Mastra `structuredOutput` pass so each chat turn makes one LLM call. The streamed text is the final reply; known runtime footers are stripped in code; the chat prompt no longer tells the model about lessons or a `message` field.

## Non-goals
- Any change to the lesson gate (phase 1).
- Changing streaming, tools, Mastra Memory, or the web app (`displayMessage` patch stays and keeps working).
- A Jev-flagged cleaner (parked — only if leaks persist).
- Migrating old threads that stored JSON `{message}` text (reader already handles it).

## Approach
1. Drop `structuredOutput` from both `agent.stream` (`chat-stream.ts`) and `agent.generate` (`llm.ts`); delete `structured-turn.ts`.
2. `resolve-turn.ts` becomes: agent text → `stripRuntimeFooters` → `{ message }`; empty text → existing `fallbackTurnFromToolCache`.
3. `prompt.ts`: delete the `## Lessons` section and reword the "message field" paragraph to plain-reply language (the footer ban stays).
4. `displayMessage` = the footer-stripped text, so the web app replaces a streamed footer with the clean text exactly as today.
5. Remove the now-dead turn schema pieces (`turnResultSchema`, `lessonSchema`, `parseTurnJson`, `turnResultJsonSchema`, `TurnResult`, `Lesson`) and their exports; drop `zod-to-json-schema` if nothing else imports it.

## Smallest solution
- Stopped at: **few lines** — delete code paths and add one regex function; no new modules.
- Not added: an LLM or Jev cleaner pass (add only if footers still leak after the prompt change — measure first); a Mastra output processor for footer stripping (one regex on final text; revisit if we need to strip mid-stream).

## Reuse
- reuse `fallbackTurnFromToolCache` in `src/tool-call-dedupe.ts` — empty-text fallback, unchanged except its return shape drops `lessons`.
- reuse `data-syraa-turn` meta + `patchLastAssistantDisplayMessage` in `apps/web/src/App.tsx` — no web change; it already swaps in `displayMessage`.
- reuse `extractDisplayText` legacy JSON handling in `src/threads.ts` — keeps old threads readable.
- None new. Searched `packages/harness/src` for existing footer/sanitise helpers (`footer`, `strip`, `sanitize`) — only `sanitizeUiPart` (UI parts, unrelated).

## File map
| Path | Action | Symbols | Notes |
|---|---|---|---|
| `packages/harness/src/mastra/structured-turn.ts` | delete | `buildStructuredTurnOutput` | |
| `packages/harness/src/mastra/chat-stream.ts` | edit | `createSyraaUIMessageStream` | No `structuredOutput`; meta `displayMessage` = stripped text |
| `packages/harness/src/llm.ts` | edit | `buildChatTurnOptions`, `runChatTurn` | No `structuredOutput`; return `{ message, model, provider }` |
| `packages/harness/src/mastra/resolve-turn.ts` | edit | `SyraaTurnMeta`, `stripRuntimeFooters`, `resolveTurnFromGenerateOutput`, `resolveTurnFromStreamOutput`; remove `turnFromStructuredObject`, `turnFromAgentText` | Text-only |
| `packages/harness/src/tool-call-dedupe.ts` | edit | `fallbackTurnFromToolCache` | Return `{ message }` |
| `packages/harness/src/mastra/prompt.ts` | edit | `SYRAA_BASE_INSTRUCTIONS` | Remove `## Lessons`; reword message-field paragraph |
| `packages/harness/src/schemas.ts` | edit | remove `turnResultSchema`, `lessonSchema`, `confidenceSchema` (if unused), `parseTurnJson`, `turnResultJsonSchema`, `TurnResult`, `Lesson` | Keep `lessonKindSchema` / `LessonKind` (used by phase-1 `GatedLesson`) |
| `packages/harness/src/chat.ts` | edit | `ChatResponse` | `lessons` type now `GatedLesson[]` only (already from phase 1); drop `runChatTurn` lessons type reference |
| `packages/harness/src/index.ts` | edit | exports | Drop removed schema exports |
| `packages/harness/package.json` | edit | dependencies | Remove `zod-to-json-schema` only if no remaining import |
| `packages/harness/tests/resolve-turn.test.ts` | edit | — | Text-only + footer-strip cases |
| `packages/harness/tests/schemas.test.ts` | edit | — | Remove `parseTurnJson` cases |
| `packages/harness/tests/tool-call-dedupe.test.ts` | edit | — | Expect `{ message }` |

## Blast radius
- Do not edit files outside the file map.
- Do not add helpers/files not listed.
- Do not touch `src/lesson-gate.ts`, `src/lessons.ts`, or `apps/web`.
- If a fork is not in Assumptions / Decisions taken, stop and ask.

## Steps

### 1. Remove `structuredOutput` from both paths
```ts
// from packages/harness/src/mastra/chat-stream.ts (and llm.ts buildChatTurnOptions)
        structuredOutput: buildStructuredTurnOutput(),
```
```ts
// to — line removed; import of buildStructuredTurnOutput removed; structured-turn.ts deleted
```

### 2. Text-only turn resolution + footer strip
```ts
// to packages/harness/src/mastra/resolve-turn.ts
import { fallbackTurnFromToolCache } from "../tool-call-dedupe.js";

export type SyraaTurnMeta = { message: string };

const FOOTER_LINE =
  /^\s*(?:[-*_]{3,}\s*)?[*_]*\s*(?:working memory updated|memory updated|lesson(?:s)? (?:extracted|saved|recorded)|_?agentNote)\b.*$/i;

/** Drop trailing runtime/status lines the model sometimes appends (and a dangling rule before them). */
export function stripRuntimeFooters(text: string): string {
  const lines = text.trimEnd().split("\n");
  while (lines.length && (FOOTER_LINE.test(lines.at(-1)!) || /^\s*([-*_]{3,})?\s*$/.test(lines.at(-1)!))) {
    lines.pop();
  }
  return lines.join("\n").trim();
}

export async function resolveTurnFromGenerateOutput(output: { text: string | Promise<string> }): Promise<SyraaTurnMeta> {
  const text = stripRuntimeFooters((await output.text) ?? "");
  return text ? { message: text } : { message: fallbackTurnFromToolCache().message.trim() };
}

export const resolveTurnFromStreamOutput = resolveTurnFromGenerateOutput;
```

### 3. Prompt
```ts
// from packages/harness/src/mastra/prompt.ts
## Lessons (structured output — not shown in chat)
… (whole section through "Put unresolved questions in open_loop, not in lesson text.")
…
Keep the visible message clean: answer only what the user asked. The message field must read like a normal chat reply — never append status footers, …
```
```ts
// to
Keep the reply clean: answer only what the user asked. It must read like a normal chat reply — never append status footers, …
```
(The "Never include in message:" list becomes "Never include in the reply:"; items unchanged except dropping "lesson JSON".)

### 4. Stream meta
```ts
// to packages/harness/src/mastra/chat-stream.ts (execute)
const turn = await resolveTurnFromStreamOutput(result);   // stripped text
… unchanged fallback write when !agentText …
const meta = await opts.onTurnComplete(turn);             // chat.ts sets displayMessage: turn.message
```

### 5. Schema + export cleanup
Delete the listed symbols; run `tsc` to confirm nothing else referenced them; remove `zod-to-json-schema` from `package.json` only if `grep -rn "zod-to-json-schema" packages apps --include=*.ts` (excl. node_modules/dist) is empty.

### 6. Tests
- `resolve-turn.test.ts`: plain text → message; text ending in `\n---\n*Working memory updated*` → footer and rule removed; text with a mid-body `---` kept; empty text → tool-cache fallback.
- `schemas.test.ts`: remove `parseTurnJson` suites.
- `tool-call-dedupe.test.ts`: expect `{ message }`.

## Decisions taken
- **Remove Mastra `structuredOutput`** despite the Mastra-first rule preferring it — there is no structured payload left to extract (lessons come from Jev in phase 1); removing it saves one LLM call per turn. Recorded here as the documented exception.
- **Regex footer strip on final text, not a Mastra output processor** — one function on one string; processor adds wiring for no extra capability today.
- **Keep the web `displayMessage` swap** — no web change; it now carries the stripped text.
- **Remove dead schema exports from `@syraa/harness`** — no consumer outside the package (`apps/api` imports only server/bootstrap symbols).

## Assumptions
- Footer leaks are driven mostly by the prompt's lesson/message-field language; after removal they are rare, and the regex covers the known phrases.
- `result.text` from `agent.stream` without `structuredOutput` is the full assistant text (tools' results woven in by the model), as it is today for `agentText`.
- Old threads with JSON `{message}` bodies keep rendering via `extractDisplayText` (unchanged).

## Risks
- **New footer phrasings** slip past the regex → visible in chat. Mitigation: manual smoke below; add phrases as seen; the Jev-flagged cleaner is the parked fallback.
- **Replies that legitimately end with "---"** lose the trailing rule — cosmetic only.
- Rollback = revert this phase; phase 1's gate is independent.
