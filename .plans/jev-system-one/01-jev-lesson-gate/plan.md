# Plan: Phase 1 — Jev lesson gate

Source: `../brainstorm.md` (final handoff), evidence `../jev-eval-report.md`. No PRD (user skipped).

## Goal
Replace the lesson decision (structurer-emitted `lessons` + `filterLessonsForTurn` / `shouldAutoActivate` regex) with one Jev call per turn that returns: keep or drop, auto-activate or pending, kind, and the text to store. Wire it into both chat paths (`handleChat`, `pipeChatStream`) without adding latency to the reply.

## Non-goals
- Removing `structuredOutput` / changing the chat prompt / footer stripping (phase 2). In phase 1 the structurer still runs; its `lessons` are ignored.
- Materials retrieve, memory-pack gating, model routing, multi-turn inference, dedup changes, UI changes, showing Jev scores anywhere.
- Re-tuning thresholds on real HITL data (follow-up after ship).

## Approach
1. `prepareChatTurn` starts `gateLesson(...)` as a promise (never awaited there). It fetches the previous assistant message from the Mastra thread, strips fenced code, and calls Jev once with 5 questions (`strict`, `reveals`, `explicitness`, `kind`, `self_contained`).
2. Frozen band rule from the eval: **auto** = strict ≥ 0.65 ∧ explicit ∧ reveals ≥ 0.5; **pending** = (strict ≥ 0.5 ∧ reveals ≥ 0.5) ∨ reveals ≥ 0.6; else **drop**.
3. On keep: pick the text. Single sentence → the message itself. Multiple sentences (via `Intl.Segmenter`) → score each sentence with `reveals` + `self_contained` in parallel, take the top. If its `self_contained` ≥ 0.85 → store verbatim; else → a small LLM call (`lesson-writer` agent) writes one sentence from `{prev, user message}`.
4. `applyLessons` receives already-gated lessons (`activate: boolean`) — no regex, no LLM confidence.
5. Any failure (no key, HTTP error, timeout, bad shape, writer failure) → `[]` + one `console.warn`. Chat never fails because of the gate.
6. Every non-drop decision logs one `console.info` line with scores + band for later threshold tuning.
7. The 183 eval cases move into the repo as an opt-in script that imports the **shipped** questions and band rule.

## Smallest solution
- Stopped at: **few lines of new code** for the Jev call (plain `fetch` + `AbortSignal.timeout`), **platform** for sentence splitting (`Intl.Segmenter`, Node ≥ 22), **reuse** for the LLM wording (Mastra `Agent`, existing `requireChatModel`) and thread history (`memory.recall` + existing `extractDisplayText`).
- Not added: a Jev SDK or AI-Gateway provider package (one endpoint, one call site — add if a second Jev use lands); a shared `jev.ts` client module (one caller — extract when materials-retrieve uses Jev); a sentence-splitting library; per-lesson `open_loop` (write-only today, nothing reads `openLoops`); multiple lessons per turn (v1 stores the top sentence only); storing scores on memory items (logs only).

## Reuse
- reuse `memory.recall({ orderBy, perPage })` in `src/threads.ts` pattern (`firstUserMessageTitle`) — same API, DESC order, small page, to get the last assistant message.
- extend `extractDisplayText` in `src/threads.ts` — already turns a `MastraDBMessage` into display text (incl. legacy JSON `{message}`); export it via a new `lastAssistantMessageText` helper in the same file.
- reuse `applyLessons` dedup (`isDuplicateLesson`) and `createItem` flow in `src/lessons.ts` — only the gating inputs change.
- reuse `requireChatModel().mastraModel` in `src/mastra/model.ts` and the `Agent` pattern in `src/mastra/agents/syraa-agent.ts` for the lesson writer.
- reuse `lessonToItemType` in `src/lessons.ts` for kind → item type.
- new `src/lesson-gate.ts` — no existing Jev client, gate, or sentence splitter in the repo (searched `packages/`, `apps/` for `typesafe`, `systemone`, `Segmenter`, `sentence`).
- new `evals/lesson-gate/` — no eval harness exists in the repo (searched for `eval`, `evals/`).

## File map
| Path | Action | Symbols | Notes |
|---|---|---|---|
| `packages/harness/src/lesson-gate.ts` | create | `GatedLesson`, `LessonGateScores`, `LESSON_GATE_QUESTIONS`, `SENTENCE_QUESTIONS`, `lessonBand`, `stripCodeBlocks`, `splitSentences`, `jevState`, `gateLesson`, `writeLessonText` | Jev call, band rule, span pick, writer call, fail-closed |
| `packages/harness/src/mastra/agents/lesson-writer.ts` | create | `createLessonWriterAgent` | Small Mastra agent definition only, no memory/tools |
| `packages/harness/src/mastra/index.ts` | edit | `getMastra`, `getLessonWriterAgent` | Register `lessonWriter` agent |
| `packages/harness/src/threads.ts` | edit | `lastAssistantMessageText` | Recall DESC, reuse `extractDisplayText` |
| `packages/harness/src/lessons.ts` | edit | `applyLessons`; remove `EXPLICIT_MARKERS`, `EXPLICIT_MEMORY_INTENT`, `ONE_OFF_TASK_QUERY`, `filterLessonsForTurn`, `shouldAutoActivate`, open_loop branch | Takes `GatedLesson[]` |
| `packages/harness/src/chat.ts` | edit | `prepareChatTurn`, `handleChat`, `pipeChatStream`, `ChatResponse` | Start gate early, await before `applyLessons` |
| `packages/harness/src/index.ts` | edit | exports | Drop `filterLessonsForTurn`, `shouldAutoActivate`; export `GatedLesson` type |
| `packages/harness/tests/harness.test.ts` | edit | — | Remove `filterLessonsForTurn` / `shouldAutoActivate` suites |
| `packages/harness/tests/lesson-gate.test.ts` | create | — | Band rule, code strip, splitter, fail-closed, verbatim vs writer (mocked fetch + writer) |
| `packages/harness/evals/lesson-gate/cases.json` | create | — | 183 cases from `.plans/jev-system-one/eval/cases*.ts`, normalised to `{id, round, prev?, user, expect, accept[]}` |
| `packages/harness/evals/lesson-gate/run.ts` | create | — | Imports shipped questions + `lessonBand`; prints acceptable / exact / wrong-auto; exits 1 below bar |
| `packages/harness/package.json` | edit | `scripts.eval:lesson-gate` | `tsx evals/lesson-gate/run.ts` |
| `.env.example` | edit | `TYPESAFE_API_KEY` | Documented, optional |
| `compose.yaml` | edit | api `environment.TYPESAFE_API_KEY` | Pass through like `FIREWORKS_API_KEY` (Dokploy sets env in UI, not `.env`) |

## Blast radius
- Do not edit files outside the file map.
- Do not add helpers/files not listed.
- Do not touch `structured-turn.ts`, `resolve-turn.ts`, `prompt.ts`, `schemas.ts` lesson schema, or `apps/web` — phase 2 / out of scope.
- If a fork is not in Assumptions / Decisions taken, stop and ask.

## Steps

### 1. Add `lastAssistantMessageText` to threads
Last assistant message text for the Jev state, using the same recall API as `firstUserMessageTitle`, newest first.

```ts
// new in packages/harness/src/threads.ts
export async function lastAssistantMessageText(opts: {
  userId: string;
  threadId: string;
}): Promise<string | null> {
  const recalled = await getSyraaMemory().recall({
    threadId: opts.threadId,
    resourceId: opts.userId,
    perPage: 6,
    orderBy: { field: "createdAt", direction: "DESC" },
  });
  for (const message of recalled.messages) {
    if (message.role !== "assistant") continue;
    const text = extractDisplayText(message);
    if (text) return text.slice(0, 2000);
  }
  return null;
}
```

### 2. Create `lesson-gate.ts`
Questions are copied **verbatim** from `.plans/jev-system-one/eval/run3.ts` (`strict`, `reveals` v2, `explicitness`), plus `kind` (round 1 criteria minus `suggestion`) and `self_contained` (round 1). One exported constant so the eval script tests exactly what ships.

```ts
// new in packages/harness/src/lesson-gate.ts
import type { LessonKind } from "./schemas.js";
import { lastAssistantMessageText } from "./threads.js";
import { getLessonWriterAgent } from "./mastra/index.js";

const JEV_URL = "https://api.typesafe.ai/v1/systemone";
const JEV_TIMEOUT_MS = 3000;
const MAX_SCORED_SENTENCES = 12;
const VERBATIM_MIN = 0.85;

export type LessonBand = "auto" | "pending" | "drop";
export type LessonGateScores = { strict: number; reveals: number; explicitness: string };
export type GatedLesson = {
  text: string;
  kind: Exclude<LessonKind, "suggestion">;
  activate: boolean;
  confidence: "high" | "medium" | "low";
};

export const LESSON_GATE_QUESTIONS = { strict: {…}, reveals: {…}, explicitness: {…}, kind: {…}, self_contained: {…} } as const;
export const SENTENCE_QUESTIONS = { reveals: LESSON_GATE_QUESTIONS.reveals, self_contained: LESSON_GATE_QUESTIONS.self_contained } as const;

export function lessonBand(s: LessonGateScores): LessonBand {
  if (s.strict >= 0.65 && s.explicitness === "explicit" && s.reveals >= 0.5) return "auto";
  if ((s.strict >= 0.5 && s.reveals >= 0.5) || s.reveals >= 0.6) return "pending";
  return "drop";
}

export function stripCodeBlocks(text: string): string {
  return text.replace(/```[\s\S]*?(```|$)/g, " ").replace(/\s+/g, " ").trim();
}

export function splitSentences(text: string): string[] {
  const seg = new Intl.Segmenter("en", { granularity: "sentence" });
  return [...seg.segment(text)].map((s) => s.segment.trim()).filter((s) => s.length > 3);
}

export function jevState(prev: string | null, user: string): string {
  return `Previous assistant message: ${prev ?? "(none — start of conversation)"}\nUser message: ${user}`;
}

async function askJev<Q extends object>(state: string, questions: Q): Promise<Record<keyof Q, JevAnswer>> {
  const key = process.env.TYPESAFE_API_KEY?.trim();
  if (!key) throw new Error("TYPESAFE_API_KEY not set");
  const res = await fetch(JEV_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "jev-latest", state, questions }),
    signal: AbortSignal.timeout(JEV_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`jev ${res.status}`);
  const body = (await res.json()) as { answers?: Record<string, JevAnswer> };
  // validate every requested key is present with a numeric noul / string choice, else throw
  …
}

export async function gateLesson(opts: {
  userId: string;
  threadId: string;
  userMessage: string;
}): Promise<GatedLesson[]> {
  try {
    const user = stripCodeBlocks(opts.userMessage);
    if (!user) return [];
    const prev = await lastAssistantMessageText(opts);
    const a = await askJev(jevState(prev, user), LESSON_GATE_QUESTIONS);
    const scores = { strict: a.strict.noul, reveals: a.reveals.noul, explicitness: a.explicitness.choice };
    const band = lessonBand(scores);
    if (band === "drop") return [];

    const text = await pickLessonText({ prev, user, turnSelfContained: a.self_contained.noul });
    if (!text) return [];
    console.info("[lesson-gate]", JSON.stringify({ threadId: opts.threadId, band, ...scores, kind: a.kind.choice }));
    return [{
      text,
      kind: a.kind.choice === "none" ? "preference" : a.kind.choice,
      activate: band === "auto",
      confidence: scores.reveals >= 0.85 ? "high" : scores.reveals >= 0.6 ? "medium" : "low",
    }];
  } catch (error) {
    console.warn("[lesson-gate] skipped:", error instanceof Error ? error.message : error);
    return [];
  }
}

async function pickLessonText(opts: { prev: string | null; user: string; turnSelfContained: number }) {
  const sentences = splitSentences(opts.user);
  let best = { s: opts.user, reveals: 1, self: opts.turnSelfContained };
  if (sentences.length > 1 && sentences.length <= MAX_SCORED_SENTENCES) {
    const scored = await Promise.all(sentences.map(async (s) => {
      const r = await askJev(jevState(opts.prev, s), SENTENCE_QUESTIONS);
      return { s, reveals: r.reveals.noul, self: r.self_contained.noul };
    }));
    best = scored.sort((x, y) => y.reveals - x.reveals)[0];
  } else if (sentences.length > MAX_SCORED_SENTENCES) {
    best = { s: opts.user, reveals: 1, self: 0 }; // too long to span-pick → writer
  }
  if (best.self >= VERBATIM_MIN) return best.s;
  return writeLessonText({ prev: opts.prev, userMessage: opts.user, focus: best.s });
}
```

### 3. Create the lesson-writer agent
Agent definition in `mastra/agents/` (like `syraa-agent.ts`); the call lives in `lesson-gate.ts` so there is no `index.ts` ↔ agent import cycle. One sentence, starts with "User", no preamble. `writeLessonText` returns `null` on empty / > 240 chars / error (gate then drops — fail closed).

```ts
// new in packages/harness/src/mastra/agents/lesson-writer.ts
import { Agent } from "@mastra/core/agent";
import { requireChatModel } from "../model.js";

export const LESSON_WRITER_AGENT_ID = "lesson-writer";

export function createLessonWriterAgent(): Agent {
  return new Agent({
    id: LESSON_WRITER_AGENT_ID,
    name: "Lesson Writer",
    instructions: [
      "Write ONE short sentence capturing the lasting preference, fact, rule, method, or decision the user expressed.",
      "Start with 'User'. Use the previous assistant message only to resolve what 'that'/'yes' refers to.",
      "Leave out the one-off task. No preamble, no quotes, no trailing explanation.",
    ].join(" "),
    model: () => requireChatModel().mastraModel,
  });
}
```

```ts
// new in packages/harness/src/lesson-gate.ts
export async function writeLessonText(opts: { prev: string | null; userMessage: string; focus: string }): Promise<string | null> {
  const out = await getLessonWriterAgent().generate(
    `Previous assistant message: ${opts.prev ?? "(none)"}\nUser message: ${opts.userMessage}\nMost relevant part: ${opts.focus}`,
    { modelSettings: { temperature: 0, maxOutputTokens: 80 } },
  );
  const text = out.text?.trim().replace(/^["']|["']$/g, "") ?? "";
  return text && text.length <= 240 ? text : null;
}
```

```ts
// to packages/harness/src/mastra/index.ts
let mastra: Mastra<{ syraa: Agent; lessonWriter: Agent }> | null = null;
…
      agents: { syraa: createSyraaAgent(), lessonWriter: createLessonWriterAgent() },
…
export function getLessonWriterAgent(): Agent {
  return getMastra().getAgent("lessonWriter");
}
```

### 4. `applyLessons` takes gated lessons
Drop the regex gating and the dead `open_loop` branch; activation comes from the gate.

```ts
// from packages/harness/src/lessons.ts
lessons: Lesson[]; userMessage: string; …
const capped = filterLessonsForTurn(opts.userMessage, opts.lessons).slice(0, 3);
…
const autoActivate = shouldAutoActivate(lesson, opts.userMessage);
… confidence: lesson.confidence ?? "medium", why: lesson.why ?? null,
if (lesson.open_loop?.trim()) { … }
```

```ts
// to packages/harness/src/lessons.ts
lessons: GatedLesson[]; (userMessage param removed)
for (const lesson of opts.lessons.slice(0, 3)) {
  …dedup unchanged…
  const item = await service.createItem({
    …,
    type: lessonToItemType(lesson.kind),
    source: lesson.activate ? "explicit" : "distilled",
    confidence: lesson.confidence,
    needsConfirm: !lesson.activate,
    status: lesson.activate ? "active" : "pending",
    why: null,
    …
  });
}
```

### 5. Wire both chat paths
Start the gate in `prepareChatTurn` (turn kind only), await it where `applyLessons` runs. The structurer's `turn.lessons` are no longer read.

```ts
// to packages/harness/src/chat.ts — prepareChatTurn, turn branch
const lessonGate = gateLesson({ userId: request.userId, threadId, userMessage: message });
return { kind: "turn" as const, …, lessonGate };

// handleChat + pipeChatStream onTurnComplete
const lessons = await prepared.lessonGate;
const memoryItems = await applyLessons(prepared.service, {
  userId: request.userId, memoryId: prepared.memoryId, lessons,
  messageId: request.messageId, existingItems: prepared.dedupItems,
});
return { …, memoryItems, lessons };   // ChatResponse.lessons: GatedLesson[]
```

`gateLesson` never rejects (catches internally), so the un-awaited promise can't cause an unhandled rejection.

### 6. Eval script (opt-in)
`cases.json` = the 183 cases from `.plans/jev-system-one/eval/cases{,2,3,4}.ts`, normalised: rounds 1–2 use their `accept` list (`expect` = first entry); rounds 3–4 use `expect` + `accept`. `run.ts` imports `LESSON_GATE_QUESTIONS`, `lessonBand`, `jevState`, `stripCodeBlocks` from `../../src/lesson-gate.ts`, runs cases with concurrency 6, prints acceptable / exact / wrong-auto per round + every miss to stdout (no files written), exits 1 if acceptable < 175/183 or any wrong auto-activation.

```json
// to packages/harness/package.json scripts
"eval:lesson-gate": "tsx evals/lesson-gate/run.ts"
```

### 7. Env
```dotenv
# to .env.example (after the Chat block)
# Jev (TypeSafe System One) — lesson gate. Unset → no lessons are saved (chat still works).
# TYPESAFE_API_KEY=
```
```yaml
# to compose.yaml api.environment
      TYPESAFE_API_KEY: ${TYPESAFE_API_KEY:-}
```

### 8. Tests
- `tests/lesson-gate.test.ts` (vitest, `vi.stubGlobal("fetch", …)`, `vi.mock` for `../src/threads.js` (`lastAssistantMessageText`) and `../src/mastra/index.js` (`getLessonWriterAgent` → fake `{ generate }`)):
  - `lessonBand` table: explicit ask → auto; implicit aside → pending; quoted-email shape (strict 0.78, explicit, reveals 0.34) → drop; research (0.02/0.07) → drop.
  - `stripCodeBlocks` removes fenced blocks incl. unterminated.
  - `splitSentences` keeps `"design pairs."` inside its sentence.
  - fail-closed: no key → `[]`; fetch 500 → `[]`; fetch throws (timeout) → `[]`; answers missing a key → `[]`.
  - single sentence + self_contained 0.9 → verbatim text, writer not called; multi-sentence with top sentence self 0.2 → writer called with `focus` = top sentence; writer returns null → `[]`.
  - band auto → `activate: true`; pending → `activate: false`.
  - `applyLessons` with a fake `MemoryService`: `activate: true` → `createItem` with `status: "active"`, `needsConfirm: false`, `source: "explicit"`; `activate: false` → `pending` / `true` / `distilled`.
  - Jev `state` includes the mocked previous assistant message, or `(none — start of conversation)` when it is `null`.
- `tests/harness.test.ts`: delete `shouldAutoActivate` and `filterLessonsForTurn` describes + imports.

## Decisions taken
- **Structurer `lessons` ignored in phase 1** (still generated until phase 2) — keeps phase 1 to the memory decision only; costs one wasted field for one phase.
- **Remove `filterLessonsForTurn` / `shouldAutoActivate` and their exports** — replaced by the gate; no consumer outside the harness (`apps/api` imports only `closeHarness`, `createHarnessServer`, `ensureHarnessReady`).
- **Drop `open_loop` capture** — Jev can't generate it; `openLoops` is written but never read anywhere (no harness, API, or web reader). Column untouched.
- **At most one lesson per turn** (top sentence) — the eval tested single-lesson picking; multi-fact messages store the strongest fact.
- **Plain `fetch`, no Jev SDK / AI Gateway provider** — one endpoint, one caller; no new dependency.
- **Gate is harness product logic, not a Mastra processor** — it writes to `@syraa/memory` (explicit product logic per the Mastra-first rule, same as `applyLessons`); the lesson writer *is* a Mastra `Agent`.
- **Add 2 questions to the frozen call** (`kind`, `self_contained`) — Jev evaluates questions independently; the eval script re-checks the frozen three in the shipped 5-question call.
- **Fail closed everywhere** (incl. writer failure) — user decision from brainstorm.
- **Pass `TYPESAFE_API_KEY` through `compose.yaml`** — matches how `FIREWORKS_API_KEY` is passed for Dokploy.

## Assumptions
- `memory.recall` with `orderBy DESC` + `perPage: 6` returns the newest messages first (same API `firstUserMessageTitle` uses with `ASC`). If not, fall back to `perPage: 40, ASC` and take the last assistant.
- The previous assistant message is read **before** the current turn's messages are persisted, because the gate starts in `prepareChatTurn` before `agent.stream` / `agent.generate`.
- Prev assistant text is capped at 2,000 chars (Jev state limit is far higher; this bounds cost). Truncation keeps the start.
- Kind `none` on a kept turn maps to `preference` (safe default storage label; kind never drives activation).
- Confidence buckets from `reveals`: ≥ 0.85 high, ≥ 0.6 medium, else low.
- Verbatim threshold 0.85 on `self_contained` (round 1: 16/17 at 0.85; untested on sentences inside long messages — the eval script covers turn-level bands only).

## Risks
- **Thresholds were fitted on our own cases** — re-tune on real approved/dismissed items after ship (logs carry scores).
- **Extra Jev calls on keep turns** — up to 1 + 12 calls when a long message is kept (parallel, rare: only keep turns). Timeout 3 s each; any failure → no lesson.
- **Writer quality is unevaluated** — it only runs when the user's words don't stand alone; pending cards show its text, so the user can dismiss a bad paraphrase.
- **Adding `kind` / `self_contained` to the call could shift the frozen three scores** — caught by `npm run eval:lesson-gate` before merge.
- **Jev early access** — outage = silently no lessons; `console.warn` per skipped turn is the only signal.
