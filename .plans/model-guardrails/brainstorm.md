# Brainstorm: model guardrails (message guard + document classification)

Status: **FINAL handoff** (user gave proceed-yes on 2026-11-21). Every critical decision is resolved; D7 (categories) is deferred → architect. Only confirmed decisions are binding.

Orchesto continues from the **PRD gate**, which is still unanswered: ask the user "Does this feature need a PRD / CPO pass?" (hint: likely not, this brainstorm already covers behavior and scope; do not skip the ask and do not auto-seat CPO). Then architect (plan + validations, approval before implementor).

## Problem framing
Add guardrails around the chat model. Original idea: a cheap classifier (Jev) reads messages, labels anything
harmful or abusive, and flags the thread. Grew into two separate pieces: a message guard on the Mastra agent, and
a separate job that classifies uploaded documents and withholds flagged ones from every agent.

## Context / constraints / severity (inferred)
- Syraa: Mastra agent harness, multi-user (Better Auth: Google + magic link), self-hosted (Dokploy compose).
- Agent tools: `search_materials` and other materials tools, `get_my_memory`, `web_search`, `web_fetch`.
  **No shell / code-exec / file-write / DB-write tool is exposed to the model**, so a message classifier is a
  signal (abuse, jailbreak, telemetry), not server protection. Real server protection stays deterministic:
  `web/url-guard.ts` (SSRF), upload 50 MB / 1 file, per-turn web-tool caps, `maxSteps: 50`.
- Existing classifier pattern: `lesson-gate.ts` calls Jev (TypeSafe System One), noul/choice questions, 3 s
  timeout, started in parallel with the chat model, never rejects, traced to Langfuse. `askJev`, `callJev`,
  `JevAnswers`, `QuestionSet`, `jevState` and the span wrapper are generic but live inside `lesson-gate.ts`.
- Mastra-first rule (`.cursor/rules/mastra-first.mdc`). `@mastra/core ^1.63.2`; `node_modules` was absent in the
  brainstorm worktree, so Mastra processor behaviour below is **unverified** and is for the architect to confirm.
- Ingest: API → Redis list `syraa:ingest:queue` → Python worker (`services/ingest-worker`) → Postgres. The worker
  embeds + persists chunks, writes a ≤600-char summary to `context_cards.summary` (`""` if skipped or failed;
  input is ≤80 headings + first 8,000 chars; `MIN_BODY_CHARS = 400`), then marks the resource `ready`.
- `ResourceStatus` = `pending_ingest | ready | failed | deleted`. Chunk search (`readyChunkScope`, `store.ts`) and the
  materials overview filter on `status = 'ready'`, so any other status is already invisible to both. The chat
  prompt lists each document as name + stored summary (`prompt.ts`).
- Compose services: `api` (shared Dockerfile; entrypoint runs migrations on every start), `ingest-worker`, others.
  `TYPESAFE_API_KEY` is passed to `api` only.

## What will be implemented (v1)
1. **`@syraa/guardrails` package** (new workspace package; Dockerfile, CI, root `check:ts`, harness dependency).
   - Core entry (no Mastra import): Jev client (moved out of `lesson-gate.ts`), `defineGuard`
     (name + question set + pure `decide(answers)`; never rejects; no-op without key; own timeout), verdict states
     `clean | flagged | unchecked`, injected `trace` hook, `guardrail_verdicts` schema + thin repository
     (own migration, run from the shared entrypoint).
   - `@syraa/guardrails/mastra` entry: `createGuardrailProcessor({ guards, resolveContext, onVerdict })` returning a
     Mastra `Processor`, attached once on the syraa agent.
   - Lesson gate moves onto the core client; its decision logic and Langfuse output stay identical.
   - `evals/guardrail/` mirroring `evals/lesson-gate`: Jev is scored on a small labelled set before it is trusted.
2. **Message guard**: processor on the agent. Classifies **user messages only**. Starts the Jev call in
   `processInput` without awaiting it, collects the verdict in `processOutputResult` (after the reply), writes a
   row to `guardrail_verdicts`. **Flag only**: never blocks, delays or alters the reply; the user sees nothing.
3. **Document classification job**: Python worker, after ingest, sets the resource to a new status
   `pending_guardrail` (instead of `ready`) and enqueues a task (jobId, userId, resourceId) on a second Redis list
   (same cross-language protocol style as `packages/ingest/src/protocol.ts`). A Node consumer, running as its own
   compose service from the same image with its own start command, reads `context_cards.summary`, runs a document
   guard on **the summary only** (one Jev call per document), writes a verdict row, and sets the resource to
   `ready` (clean) or `quarantined` (flagged). Unchecked = retry, then stay held (strict, see D13). No summary = `quarantined` with reason "could not be reviewed" (D15).
4. **Withheld documents**: `pending_guardrail` and `quarantined` documents are not searchable by any agent and
   their summary is not shown to the model. The agent's context gets a fixed notice naming the document and the
   reason label (materials overview in `prompt.ts`, plus `list_materials` / `search_materials` results).
5. **Review surface (D4b)**: the user sees "withheld: <reason>" in the UI; an admin-only API lists flags; no review
   UI in v1; overrides are a manual step.
6. **Retention (D5)**: verdict rows kept 90 days; message text is stored only for flagged messages; documents are
   never copied (the verdict row points to them).
7. **Existing documents (D16)**: grandfathered. Documents already `ready` stay `ready` and unclassified; no backfill
   in v1. The guard applies to new uploads only.

## Part map / coverage
- Message guard (scope, placement, storage): settled
- Document job (shape, placement, input, action, timing, strictness, no-summary case): settled
- Package `@syraa/guardrails` (boundary, entries): settled
- Withheld-document context notice: settled
- Categories (D7): deferred → architect
- Web content scanning (D3c): out of v1 (settled)
- Existing documents already `ready` (D16): settled (grandfathered, no backfill in v1)
- Deterministic limits (rate limit, cost caps): not in this feature's v1 scope unless the architect adds them (see Risks)

## Architecture (whole)
Two guards, one package, one verdict table.
- Message path: user message → Mastra agent → guardrail processor starts Jev in parallel with the model → reply
  streams untouched → verdict row written after the reply.
- Document path: upload → worker ingests, embeds, persists, status `pending_guardrail` → task on second Redis list →
  Node guard consumer → Jev on the stored summary → verdict row → resource set to `ready` or `quarantined`.
  Enforcement is the resource `status` (already filtered by search and the overview); the verdict table is the
  audit and measurement source of truth. Deleting verdict rows (retention) must never change a document's status.
- "Not indexed" means stored but unreachable: embeddings exist in Postgres, but no agent query can reach a
  non-`ready` resource. Truly never embedding would need classification before ingest embeds, which D9 rules out.

## Assumptions (labeled, with why)
- "Jeff" = Jev (TypeSafe System One) → the only such classifier in the repo and used by the lesson gate → assumed
- Guard `decide` is a pure function over Jev answers, unit-tested offline → `lessonBand`/`decideLesson` already work this way → assumed
- A guard is a no-op when its key is unset; documents then go straight to `ready` as today (the strict hold applies
  only when the guard is enabled) → `gateLesson` and the README's default-off behaviour; accepted in the D12 question → assumed
- Lesson gate decision logic is untouched; only the Jev client is extracted → you asked for a reusable piece → assumed
- Verdict schema + repository live in the guardrails package with their own migration → `memory` and `context` each own theirs → assumed
- The withheld notice shows the document name plus a fixed reason label → names are already in the prompt today → assumed

## Critical decisions
- D1 Message flag action → confirmed: flag only, async, off the reply path (my pick). Blocking is a later step once precision is measured.
- D2 Classifier → confirmed: Jev (my pick). Gate: score it on a labelled set; if precision is poor, fall back to an LLM judge. Mastra built-in guardrail processors rejected for v1 (run on the reply path).
- D3a Message guard classifies → confirmed: user messages only.
- D3b PDFs / materials → confirmed: separate best-effort job, not part of the message guard.
- D3c Web content (`web_fetch` / `web_search`) → confirmed: not scanned in v1; can be added later as one more guard (my pick).
- D4a Verdict storage → confirmed: `guardrail_verdicts` table, including `clean` and `unchecked` rows (my pick).
- D4b Review surface → confirmed: user sees the withheld reason in the UI; admin-only API lists flags; no review UI v1; override is manual (my pick).
- D5 Retention → confirmed: verdict rows 90 days; message text stored only for flagged messages; documents never copied (my pick).
- D6 Package boundary → confirmed: new workspace package `@syraa/guardrails` (my pick was a module inside harness). **User override.** Downside: wiring in Dockerfile, CI, `check:ts`, harness dependency; one more package boundary.
- D7 Categories → **deferred → architect** (user's call). Architect resolves them with a recommendation to the user, since categories are product behavior. Scope already fixed: message guard = abuse / jailbreak / prompt-injection style; document guard = what the document is about (topic / policy level).
- D8 Mastra dependency → confirmed: Mastra-free core + `@syraa/guardrails/mastra` adapter entry (my pick was Mastra-native single entry). **User override.** Downside: injected `trace` hook, two entry points, harness maps Mastra spans onto the hook.
- D9 Document job placement → confirmed: Node job using the guardrails core, fed by a second Redis queue (my pick was a step in the Python worker). **User override.** Downside: new queue protocol, consumer, enqueue step in the worker, extra work (~3x).
- D10a Document flag action → confirmed (user's requirement; my pick was flag only): flagged documents are not indexed and not searchable by any agent. Downside: false positives hide a user's own file.
- D10b Job input → confirmed: stored summary only, one Jev call per document (my pick was summary + capped chunk sample). **User override.** Downside, accepted: blind to an instruction past the first 8,000 chars or one a summariser paraphrases away; no protection against indirect prompt injection from documents.
- D11 Consumer placement → confirmed: its own compose service from the same image (my pick). Plan-time: skip or wait out the shared entrypoint's migrations; pass `TYPESAFE_API_KEY` and `REDIS_URL`.
- D12 Timing → confirmed: hold-then-release (my pick). New status `pending_guardrail`; worker stops setting `ready` itself when the guard is enabled; the consumer sets `ready` or `quarantined`.
- D13 `unchecked` policy → confirmed (user's words: "retry and get stuck is fine, I want this to be strict"): on `unchecked` (Jev down, error, timeout) the job retries and, if still unchecked, the document **stays held**. No fail-open path while the guard is enabled. (My pick was retry then release; **user override**.) Downside: a Jev outage leaves new uploads unusable until it recovers; stuck documents need a manual re-run path (architect).
- D14 Reason in the agent's context → confirmed (user's requirement): the agent is told a document is unavailable and why. Fixed label from our category list; never Jev free text; never the flagged document's summary or content.
- D15 Documents with **no summary** under strict + summary-only → confirmed: B (my pick). The job moves them straight to terminal `quarantined` with a distinct reason label ("could not be reviewed"); they are not left in `pending_guardrail`. An operator can release them manually. Downside, accepted: scanned or image-only PDFs, and PDFs with garbled legacy-font text, are unusable until released by hand.
- D16 Existing documents already `ready` → confirmed: A, grandfather (my pick was B, backfill with a dry-run preview). **User override.** Existing `ready` documents stay `ready` and unclassified; the guard applies to new uploads only; no backfill in v1. Downside, accepted: users' old libraries stay searchable and unreviewed, which does not match the strict stance for new uploads. A later backfill is possible by enqueuing old documents on the same queue (separate work).

## D15 detail (resolved: B)
Under D10b (summary only) and D13 (strict), a document with no summary can never be cleared. The worker returns no
summary when there is too little clean text (`MIN_BODY_CHARS = 400`; scanned PDFs, legacy-font PDFs with garbled text)
or when the summary call fails. Retrying Jev does not create a summary, so these would sit in `pending_guardrail`
forever while showing a "pending review" message that is not true. Options: A stay held forever; B (pick) move to
terminal `quarantined` with a distinct reason label such as "could not be reviewed", so the message is accurate and
an operator can release it manually; C release as `ready` with an `unchecked` verdict (breaks strict).

## Ideas surfaced
- Run in shadow mode first (verdict rows, no document action) and promote once precision is measured → raised
- Per-user risk accumulation (N flags in a window → throttle) → raised, parked
- Backfill existing documents later by enqueuing them on the same classification queue → raised, parked (D16)
- Scan untrusted content (web pages, document chunks) separately from user intent → raised, parked (D3c, D10b)

## Open questions
- none opened (no question round requested)

## Risks / open concerns
- Classifier is a signal, not a wall: bypass by paraphrase, other language, or multi-turn splitting.
- Message guard does not see indirect injection via web pages (D3c) or document bodies (D10b), the realistic attack on this agent.
- A document verdict has teeth but rests on a ≤600-char summary: false positives hide a user's own file; a deliberate injection can still pass.
- Strict hold (D13): a Jev outage blocks every new upload; stuck documents need a re-run path and operator visibility.
- Grandfathered libraries (D16) stay searchable and unreviewed, so the strict guarantee only holds for uploads made after release.
- No rate limiting or cost caps are part of this feature; the "deterministic limits" layer I recommended earlier is not in v1 unless the architect adds it.
- Unverified Mastra behaviour: carrying the in-flight Jev promise from `processInput` to `processOutputResult` (per-request processor state, else a WeakMap keyed on the request or the run context), and that the unawaited call survives until the output hook.
- Unverified: whether the `context_resources.status` column has a DB constraint (it is typed in TypeScript only); `node_modules` absent in the brainstorm worktree.

## Recommended next step
- PRD gate (likely skip: this brainstorm covers behavior and scope) → architect (who also resolves D7).

## Notes for CPO / architect
- Only **confirmed** critical decisions are binding.
- `deferred → architect`: D7 (categories). Critical, so the architect still puts it to the user with a recommendation.
- Unverified items above are for the architect to confirm against the installed Mastra and the database.
