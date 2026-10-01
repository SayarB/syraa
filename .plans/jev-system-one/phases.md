# Phases: Jev lesson gate

## Split rationale
Phase 1 changes *what gets remembered* and is checkable against the eval set on its own; phase 2 changes *how replies are produced* (one LLM call, footers fixed at the source) and can be rolled back without losing the gate.

## Phases
| # | Folder | Capability | Status |
|---|---|---|---|
| 1 | `01-jev-lesson-gate` | Jev decides whether a turn teaches something durable and what text to store; memory writes no longer depend on the structurer's lessons or the regex filters. | pass (round 2; in-app smoke pending) |
| 2 | `02-single-llm-pass` | Each chat turn makes one LLM call: the structuring pass is gone, the streamed text is the final reply, and runtime footers are stripped in code. | pass (in-app smoke pending) |

## Rules
- Approve **one** phase's plan/validations to build it. That approval is the go.
- After review `pass`, stop until the next phase is approved. Do not auto-start.
