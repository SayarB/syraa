# Mastra feature inventory → Syraa adoption

**Sources:** `@mastra/core` docs + [mastra.ai/docs](https://mastra.ai/docs) (2026-09-01)  
**Opinion lens:** Mastra owns agent *runtime*; `@syraa/*` owns product *domain*.  
**Priority lock (user 2026-09-01):** Wave 1 = stop DIY · Wave 2 = defer obs/workflows/harness · Wave 3 = FS/browser/skills after Wave 1.

Legend: **Wave 1** · **Wave 2 (defer)** · **Wave 3** · **Later** · **Skip**

---

## Agents

| Feature | What it is | Syraa? | Opinion |
|---|---|---|---|
| Agent + `generate` / `stream` | Core LLM loop | **Wave 1** | Finish properly; stream for chat UX |
| Tools (`createTool`) | Model-callable actions | **Wave 1** | Expand materials via `@syraa/context` |
| Structured output | Zod/JSON schema replies | **Wave 1** | Keep for `{ message, lessons }` |
| Processors | Transform I/O around generate | **Wave 1** | Prefer over hand-rolled prompt hacks |
| Guardrails | Safety filters | **Later** | Before wider users |
| Agent HITL | Approve tool/step mid-run | **Later** | Align with Memory confirm chips |
| Dynamic instructions/model | Per-request swap | **Later** | Nice for tiers / desks |
| Networks / supervisors | Multi-agent orchestration | **Later** | Overkill until single agent is solid |
| Voice | STT/TTS | **Skip** (v1) | Not the wedge |
| Code mode / Sandbox shell | Agent writes/runs code | **Skip** | Wrong product |

## Memory (Mastra Memory package)

| Feature | What it is | Syraa? | Opinion |
|---|---|---|---|
| Message history (`thread` + `resource`) | Persisted chat transcript | **Wave 1** | **Must.** Kill client-owned history-as-SoT |
| `lastMessages` / window | Trim history into model | **Wave 1** | Replace DIY slice/pin |
| Working memory | Durable scratchpad | **Wave 1** | Thread scope for materials L1 |
| Working memory `readOnly` | Inject WM without update tool | **Wave 1** | Materials overview read-only |
| Observational Memory | Compress old turns | **Wave 2** | After threads get long |
| Semantic recall | Vector recall of past messages | **Later** | Don’t confuse with materials RAG |
| Memory processors | Filter/trim context | **Wave 1** | Part of processors push |
| Multi-user threads | Shared conversation | **Skip** (v1) | Single-user desks first |
| `context: []` on generate | One-off messages, not saved | **Wave 1→later** | Ephemeral TurnPack / escalate |

## Observability

| Feature | What it is | Syraa? | Opinion |
|---|---|---|---|
| Tracing / Studio / exporters | See model context, APM | **Wave 2 (defer)** | Useful; not blocking Wave 1 |
| Metrics / feedback | Cost + human ratings | **Later** | After traces land |

## Storage

| Feature | What it is | Syraa? | Opinion |
|---|---|---|---|
| Mastra storage on instance | Persist threads/WM | **Wave 1** | **Use same Postgres** we already run |
| Composite storage | Split app vs obs | **Wave 2** | When/if obs volume grows |
| LibSQL | Local file DB | Optional | Only if Postgres wiring lags; prefer one DB |

## Workflows

| Feature | What it is | Syraa? | Opinion |
|---|---|---|---|
| Steps / suspend / recipes | Deterministic multi-step | **Wave 2 (defer)** | Recipes after chat path is Mastra-native |
| Schedules / Inngest | Cron / durable runners | **Later** | |

## Harness (long-running agent control)

| Feature | What it is | Syraa? | Opinion |
|---|---|---|---|
| Durable agents / goals / signals | Survive disconnect, objectives | **Wave 2 (defer)** | Don’t block Wave 1 |
| AgentController | Product session host | **Wave 2 (defer)** | Strong long-term UI fit; later |
| Background tasks | Async tool/workflow | **Later** | Ingest already async |

## Studio / Server / Client

| Feature | What it is | Syraa? | Opinion |
|---|---|---|---|
| Studio / `mastra dev` | Dev UI | **Wave 2** | With observability |
| Mastra Client | Typed client for threads | **Wave 1→C** | When UI lists/resumes threads |
| Auth / pubsub | Secure Studio/API | **Later** | Multi-user |

## Evals / datasets

| Feature | What it is | Syraa? | Opinion |
|---|---|---|---|
| Scorers / CI evals | Quality gates | **Later** | After runtime spine |
| Datasets / multi-turn | A-B / conversation quality | **Later** | |

## Connections

| Feature | What it is | Syraa? | Opinion |
|---|---|---|---|
| MCP | External tools | **Later** | Optional |
| A2A / ACP / channels | Remote agents / Slack | **Skip** (v1) | Web desk first |

## Filesystem / browser / skills (Wave 3)

| Feature | What it is | Syraa? | Opinion |
|---|---|---|---|
| Filesystem / search | Agent file access | **Wave 3** | **Important** — after Wave 1 only |
| Browser automation | Web browsing tool | **Wave 3** | **Important** — after Wave 1 only |
| Skills | On-demand instruction packs | **Wave 3** | Kind/recipe playbooks |
| Sandbox (shell/code) | Isolated exec | **Skip** | Not a coding agent |

---

## Locked priority (user)

### Wave 1 — incorporate now (slowly)
1. `generate` / `stream`  
2. Tools  
3. Structured output  
4. Processors  
5. Message history + `lastMessages`  
6. Thread working memory (materials L1, read-only)  
7. **Mastra storage on existing Postgres**  

### Wave 2 — defer
- Observability / Studio traces  
- Workflows  
- Harness / AgentController  

### Wave 3 — after Wave 1 is solid
- Filesystem  
- Browser  
- Skills  

### Keep ours
- `@syraa/memory` — HITL prefs/rules  
- `@syraa/context` — materials pyramid / retrieve  
- Ingest worker  

### Trap
Don’t start FS/browser/skills while still DIY’ing history, windowing, WM, or storage. Fix the easy Mastra surface first.
