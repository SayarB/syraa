# Brainstorm: Jev (TypeSafe System One) in Syraa

> Status: **final handoff** (2026-09-21) — user said proceed; PRD skipped by user → architect.

## Problem framing
Syraa’s chat LLM currently does two jobs: generate the reply (System 2) and make a pile of typed decisions (is this a lesson? which material? escalate retrieve? how confident?). Those decisions are slow, easy to get wrong, and already patched with regex + prompt rules. Jev is a non-generative model: state in, typed probabilities out. Use it as smart if-statements around the Mastra loop — not as the chat voice.

## Context / constraints / severity (inferred)
- Product: Syraa — local agent harness (Mastra chat + `@syraa/memory` HITL + `@syraa/context` materials).
- Constraint: Mastra-first. Wire via processor/tool around `handleChatStream` / `createTool`. No custom SSE. Domain packages must not import Mastra.
- Constraint: Jev cannot generate strings (no chat, no tool args, no lesson *wording* unless we keep the user’s words).
- Access: Jev is early access / AI Gateway (`typesafe-ai/jev`). Thresholds need a small eval set of real turns.
- User ask: discuss candidate uses **one by one** (not a five-way architecture dump).

## What will be implemented (v1)
- **Jev lesson gate** in harness: one Jev call per turn on `{ user_message, prev_assistant_message }`, started in parallel with `agent.stream`, consumed in `onTurnComplete` before `applyLessons`.
- **Two questions, one call** (`strict` = user asked to remember; `reveals` v2 = worth remembering, incl. team decisions) + `explicitness`. Bands: auto = strict ≥ 0.65 ∧ explicit ∧ reveals ≥ 0.5; pending = (strict ≥ 0.5 ∧ reveals ≥ 0.5) ∨ reveals ≥ 0.6; drop otherwise. Implicit asides / inferred rules → always pending, never auto (replaces `filterLessonsForTurn` + `shouldAutoActivate` regex and LLM `confidence`). Thresholds from `jev-eval-report.md`; re-tune on real HITL history.
- `kind` is a stored label only — **not** used for auto-activation (Jev overcalls `rule`, 12/19).
- Turn-level gate first; per-sentence scores only pick the span to store.
- Lesson text: verbatim sentence when Jev says self-contained; else a small LLM wording call **only on Jev-yes turns**.
- **Structuring pass removed** (assumed): lesson/`message` duties out of the chat prompt, small deterministic footer strip in `resolveTurnFromStreamOutput`, no `displayMessage` swap.
- Strip fenced code blocks from the state sent to Jev; use a proper sentence splitter (not regex) for span picking.
- Jev unavailable → **fail closed** (no lessons that turn) + log line.
- Eval set (183 cases) moves into the repo as an **opt-in** eval script (live Jev calls, not in the default test run) — regression check for question wording.
- Chat agent stays on the LLM. Other Jev uses not in v1.

## Part map / coverage
- **Lesson extraction / HITL gate** → settled (v1)
- **Materials retrieve (escalate vs skip)** → assumed (later)
- **Memory pack gating** → assumed (later)
- **Draft guardrail check** → parked (only if footer leaks persist after structurer removal)
- **Model routing** → parked (later; nice-to-have)

## Per-part notes

### Lesson extraction / HITL gate

**Today (verified in code)**
- Chat agent streams to the UI; then `structuredOutput` (`mastra/structured-turn.ts`) runs a **second chat-model pass** over the draft producing `{ message, lessons }`.
- `message` is not the streamed reply — it becomes `displayMessage`, which the web app **swaps in after the stream ends** (`apps/web/src/App.tsx:173`). So the structurer is really two jobs: **reply cleaner** (strip footers/recaps) + **lesson extractor**.
- `filterLessonsForTurn` (`packages/harness/src/lessons.ts`) uses regex (explicit markers vs one-off research).
- `applyLessons` caps 3, dedups (`isDuplicateLesson`), auto-activates rules / marker-y lessons (`shouldAutoActivate`), else pending HITL.
- Confidence is an LLM-guessed `high|medium|low`.
- `ItemStatus` includes `dismissed` → past approve/dismiss decisions on pending items are **free labels** for an eval set.

**Pain**
- The structurer is still generating: it can invent lessons from topic interest despite instructions.
- Regex is both too strict (“I prefer dark mode” with no magic words) and too loose (markers inside a research ask).
- Mixing “clean the reply” (generation) with “should we remember?” (decision) in one LLM call, every turn.

**Findings from the code**
1. Jev’s input (the user turn) exists at `prepareChatTurn` — **before** the agent runs. The Jev call can run in parallel with `agent.stream` → ~0 added latency.
2. “Store the user’s wording” breaks on common teaching shapes:
   - Referential: “yes, always do it that way” (meaning lives in the previous assistant message).
   - Mixed: “remember I’m vegetarian — also find me dinner tonight” (verbatim drags the one-off in).

**Direction (proposed)**
- Jev call input: `{ user_message, prev_assistant_message }`.
- Outputs:

| Field | Type | Replaces |
|---|---|---|
| `teaches_durable_fact` | p(yes) | `EXPLICIT_MEMORY_INTENT` + `ONE_OFF_TASK_QUERY` regex; structurer’s “lessons must be []” prompt |
| `explicitness` | explicit / implicit | `EXPLICIT_MARKERS` in `shouldAutoActivate` |
| `kind` | preference / rule / method / decision | LLM-picked `kind` |
| `self_contained` | p(yes) | picks verbatim vs generate-on-yes |

- Three bands on p(yes): **high + explicit → auto-activate**, **middle → pending HITL card**, **low → drop**. HITL makes false positives cheap (a dismissable card), so the pending threshold can be loose and the auto-activate threshold strict.
- Lesson text: **sentence-level gating** (split in code, Jev scores sentences) → use the verbatim sentence when it’s self-contained; else **conditional generation** — a small LLM call writes the lesson text only on Jev-yes turns (likely <5% of traffic).
- Dedup stays as-is for v1.

**Wrap-up (lesson gate)**
- Settled (from user): Jev as side evaluator, LLM keeps the voice; lesson gating first.
- Assumed: drop structurer; 1 prev assistant message of context; fail closed; three bands; conditional wording (see Assumptions).
- Override / cut: none yet.

**Architecture (lesson gate)**
1. `prepareChatTurn` → start `jevGate({ userMessage, prevAssistant })` (promise, not awaited).
2. `agent.stream` runs with no `structuredOutput`; streamed text is final text.
3. `onTurnComplete` awaits the gate: sentences scored → band per sentence.
4. Yes + self-contained → verbatim text; yes + referential → `writeLessonText()` small LLM call.
5. `applyLessons` receives already-gated lessons + band (auto-activate vs pending); dedup unchanged.
6. Jev error/timeout → `[]`.
Out of v1: multi-turn inferred prefs, Jev-based dedup/contradiction, UI for scores.

**Not this part:** replacing the chat model or `message` generation with Jev.

### Materials retrieve (escalate vs skip)
Assumed later. Context plan already wants escalate-only-when-needed; name matching is brittle. One Jev call on `{ user message, materials outline }`.

### Memory pack gating
Assumed later. Same pattern as lessons, on active items vs pack stuffing.

### Draft guardrail check
Assumed later / weaker on its own. Becomes relevant only if leaks persist after the structurer is removed: Jev scores “draft needs cleaning?” and the cleaner runs only when flagged.

### Model routing
Parked. “Simple follow-up vs materials/reasoning” → cheap vs frontier. Cascade, not v1.

## Architecture (whole)
Jev is a **side evaluator**, not a Mastra agent replacement. Chat stays `agent.stream`. Domain packages stay Mastra-free. Jev client lives in harness (or a tiny adapter), called at turn start (parallel) and consumed in `onTurnComplete` before `applyLessons`.

## Assumptions (labeled, with why)
- “Jeff” = TypeSafe **Jev**. → assumed
- We will **not** replace the chat model with Jev — Jev cannot generate. → assumed
- Discuss **one part at a time**, starting with **lesson gating**. → assumed
- Mastra-first wiring (processor/tool, not custom stream protocol) — repo rule. → assumed
- v1 is **not** all five uses — stacking evaluators without an eval set is fashion. → assumed (brainstormer)
- **Drop the structuring pass** → because lessons leave it, its remaining job (footer stripping) is a symptom of `mastra/prompt.ts:54-58` telling the chat model about lesson/message duties; removing those duties + a regex strip is the boring fix and saves an LLM call per turn → assumed
- **Gate context = current user turn + 1 previous assistant message** → because referential teaching ("yes, always do that") is common and needs it; multi-turn inference is a separate feature with its own false-positive risk → assumed
- **Fail closed when Jev is unavailable** → because it is early access, a missed lesson is re-teachable, and keeping regex + structurer as fallback means two paths to maintain → assumed
- **Three bands, loose pending / strict auto-activate** → because HITL makes a false-positive pending card cheap, while a wrong auto-activate silently changes behavior → assumed
- **Thresholds tuned on past approve/dismiss history** → because `ItemStatus` already records `dismissed` → assumed

## Eval evidence (2026-09-21)
See `jev-eval-report.md`. 37 hard cases through `jev-1.13.0`: keep vs drop 37/37 (negatives ≤ 0.26, positives ≥ 0.55); bands 37/37 at auto 0.65; explicitness clean; self-contained 16/17; kind 12/19; p50 264 ms; near-deterministic. Regex baseline would auto-activate on 9 marker traps Jev drops.
Round 2 (26 cases: buried asides, rules inferred from complaints, long personal controls): strict question catches only 2/18 asides → added `reveals` question (18/18 with v2, 8/8 controls). Quoted text fooled `strict` (N7 0.78 explicit) → reveals guard on auto. Combined rule 63/63, stable across thresholds; margin 0.50 vs 0.68.
Round 3 (100 held-out cases, rule frozen): **95/100 acceptable, 92/100 exact, 0/14 wrong auto-activations**; easy 100% / medium 97% / hard 91%. All 5 errors in the reveals 0.4–0.7 band. Harness follow-ups: strip fenced code from state; always send prev assistant message.
Round 4 (20 long 150–300-word messages, held-out): 20/20 acceptable; 13/13 buried asides/inferred rules caught (reveals 0.68–0.96); per-sentence scoring put the buried line #1 in 11/12. `strict` alone would have caught 4/13. Use a real sentence splitter; inferred-rule complaints still need LLM wording.

## Decisions
- Jev as side evaluator for lesson gating only in v1 — over replacing chat model or stacking all five uses — because Jev can't generate and there's no eval set for the other uses yet.
- Two questions (`strict` + `reveals` v2) + `explicitness` in one call, frozen rule — over the round-1 single question — because strict alone catches 2/18 short and 4/13 long asides and is fooled by quoted text.
- `kind` never drives activation — Jev overcalls `rule`.
- Remove the structuring pass — over keeping it as a cleaner — saves an LLM call per turn; footers fixed at the prompt source + regex strip.
- Fail closed — over regex/structurer fallback — one code path.
- Explicit-but-temporary asks ("please remember that" about trip dates) → drop (stricter rule kept); the "never drop explicit" variant was a wash on the eval.
- No PRD/CPO pass — user decision; internal harness change, brainstorm + eval report carry the what/why.

## Ideas surfaced
- Split structured turn: LLM = message; Jev = remember-or-not → **discussing**
- Run Jev in parallel with `agent.stream` from turn start → **proposed**
- Three-band thresholds mapped onto auto-activate / pending / drop → **proposed**
- Sentence-level gating + conditional LLM wording only on Jev-yes → **proposed** (replaces pure verbatim)
- HITL approve/dismiss history as eval labels → **proposed**
- Drop the structuring pass entirely; fix footers at source → **assumed**
- Jev-flagged cleaner (run a cleaner only if Jev says draft leaked) → **parked** (only if leaks persist after prompt change)
- Keep LLM lesson extract, Jev only vetoes → **fallback** (weaker; still pays for hallucinated lessons)
- Use Jev for all five at once → **rejected for v1**

## Risks / open concerns
- Thresholds were tuned on our own 37-case set — must be re-checked on real approved/dismissed HITL items before shipping.
- `kind` misclassification (rule bias) — mitigated by not using kind for activation.
- Implicit inference raises pending-card volume — user tolerance for cards/week is a product call.
- Question wording is load-bearing (one phrase cost 2 cases) — version question text and keep the eval set as a regression test.
- Early-access availability / Gateway vs first-party API (fail-closed means Jev downtime = silent lesson loss; worth a log line).
- Dropping the structurer removes the only footer guard today — prompt change must land in the same slice.
- Sentence splitting on messy chat input (lists, code blocks, run-ons).

## Recommended next step
- Skip PRD (user) → **architect** for the lesson-gate slice.
- Later parts (materials retrieve, memory pack gating, draft guardrail, model routing) stay parked for a future brainstorm.

## Notes for CPO / architect
- Evidence: `jev-eval-report.md` (4 rounds, 183 cases: 37 + 26 + 100 + 20); frozen questions live in `eval/run3.ts` — copy verbatim.
- API facts: `POST https://api.typesafe.ai/v1/systemone`, `Authorization: Bearer $TYPESAFE_API_KEY`, body `{ model: "jev-latest", state, questions }`; yes/no type is `noul` (answer field `noul`), not `boolean`.
- Follow-up (not blocker): re-tune thresholds on real approved/dismissed HITL items.
- Do not put Jev in `@syraa/memory` (domain package). Harness owns the call; memory still receives already-gated items.
- Do not invent a new stream event type for Jev scores unless the UI needs to show them.
