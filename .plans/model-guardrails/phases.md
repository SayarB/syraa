# Phases: model guardrails

## Split rationale
Two capability steps that stack: the first builds the reusable package and a flag-only guard on chat; the second adds the document hold, queue and withheld-document behavior on top of that package. Phase 1 is shippable alone (it only records verdicts); phase 2 changes what users and the agent can see.

## Phases
| # | Folder | Capability | Status |
|---|--------|------------|--------|
| 1 | `01-message-guard` | Every user chat message is classified by Jev in parallel with the reply and recorded as a clean, flagged or unchecked verdict, without ever blocking or delaying the reply, and the Jev client is now a reusable `@syraa/guardrails` package that the lesson gate also uses. | pass |
| 2 | `02-document-guard` | New uploads are held after ingest, classified on their stored summary by a separate consumer, released to the agent when clean or quarantined when flagged or unreviewable, and the agent and the user are told which documents are withheld and why. | pending-approval |

## Decisions that apply to both phases
These come from `brainstorm.md` (D1 to D16 are binding) plus the three architect-seat calls the user made on 2026-11-21:
- **D7 resolved: recommended set.** Message categories `jailbreak`, `abuse`, `harmful_request`. Document categories `harmful_instructions`, `sexual_content`, `hate_or_harassment`, `ai_instructions`, plus the system reason `unreviewable`. Self-harm and personal data are out of v1.
- **Admin surface: no HTTP API.** This overrides the "admin-only API" half of D4b. Flags are listed with a CLI over the verdict table (phase 1); document overrides are a CLI too (phase 2). There is no admin role, allowlist, or new endpoint.
- **Two phases**, as above.

## Verified in the architect seat (read-only)
- Mastra 1.63.2: the per-run processor `state` is shared by `processInput` and `processOutputResult`, but `processOutputResult` is awaited before the stream completes, so the processor must **not** await Jev there. It starts Jev in `processInput` and writes the verdict from a detached promise.
- `context_resources.status` **does** have a DB check constraint (`context_resources_status_check`), so phase 2 needs a migration.

## Rules
- Approve **one** phase's plan/validations to build it. That approval is the go.
- After review `pass`, stop until the next phase is approved. Do not auto-start.
