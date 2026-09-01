# Decision: Mastra-first harness (revises “thin Mastra / no Mastra Memory”)

**Status:** Wave 1 shipped (phases 01–04) — 2026-09-02  
**Supersedes (in part):** `plans/harness.md` / `plans/memory.md` lines that said **do not use Mastra Memory** for session history / context window.

## Implementation status (phases 01–04)

| # | Capability | Status |
|---|---|---|
| 01 | Threaded chat on Mastra Memory + Postgres | **done** |
| 02 | Materials L1 in thread working memory | **done** |
| 03 | Stream + tools + structured `{ message, lessons }` | **done** |
| 04 | Thread UI (list / resume / new chat) | **done** |

**Wave 1 follow-ups (deferred):** Mastra processors for memory pack, Observability/Studio, `handleChatStream` refactor.

## Principle

If Mastra already provides a capability we are DIY’ing poorly, **use Mastra first**. Only after the agent runtime is Mastra-native do we add filesystem / browser / skills.

**Enforcement:** `.cursor/rules/mastra-first.mdc` (always apply) and vault `projects/syraa/instructions/coding.md`.

Syraa domain packages stay the source of truth for **product** data. Mastra owns the **agent runtime**.

## Keep ours (domain SDKs)

| Package | Owns | Must not become |
|---|---|---|
| `@syraa/memory` | Prefs, rules, methods, decisions (HITL) | Chat transcript store |
| `@syraa/context` | Resources, topics, chunks, cards, retrieve/assemble | Mastra thread history |
| `@syraa/ingest` | PDF → topics/chunks queue worker | Agent orchestration |
| Drive / Postgres product tables | User materials & product rows | Trace warehouse |

Mastra must **not** replace these schemas. Domain packages still **must not import Mastra**.

## Adoption order (locked)

### Wave 1 — Stop DIY’ing the easy Mastra surface
Ship slowly, but all of these are in-scope before FS/browser:

| Concern | Mastra feature | Replace our DIY |
|---|---|---|
| Chat loop | `generate` / `stream` | Half-wired streaming |
| Tools | `createTool` | Ad-hoc side effects |
| Structured output | Zod schemas | Loose JSON parsing |
| Processors | Input/output processors | Hand-rolled prompt hacks |
| Session messages | Memory + `thread` + `resource` | Client `history[]` as SoT |
| Context window | `lastMessages`, processors | `pinSessionSeeds` / manual slice |
| Materials L1 seed | Thread **working memory** (prefer read-only) | `[syraa:materials-overview]` bootstrap |
| Storage | **Mastra storage on our existing Postgres** | In-memory / LibSQL-only defaults |

### Wave 2 — Deferred (explicitly not blocking Wave 1)
- **Observability** / Studio traces — useful, but deferred  
- **Workflows** — recipes later  
- **Harness** (durable agents, AgentController, goals, signals) — later  

### Wave 3 — After Wave 1 is solid
- **Filesystem** access (agent can work with files — important)  
- **Browser** access (web tool — important)  
- **Skills** (on-demand instruction packs / playbooks)  

Do **not** start Wave 3 until chat path no longer DIY’s history, windowing, WM seeds, or storage.

## Revised rules

1. **Chat path:** `agent.generate` / `stream` with `memory: { thread, resource: userId }` — no client-owned transcript as system of record.  
2. **UI:** load/save threads via Mastra memory APIs; client caches for UX only.  
3. **Materials overview:** write into **thread working memory** at session start (refresh when ingest completes).  
4. **Product memory (`@syraa/memory`):** still inject via instructions / processors — not confused with Mastra message history.  
5. **Storage:** Mastra store backed by the **same Postgres** we already run (shared DB, Mastra-owned tables — not reinventing a second session store).  
6. **Observability:** deferred; add when debugging context becomes painful.  
7. **Context package:** keep outlines / TurnPacks; feed via working memory, `context:`, or tools — don’t invent a second window manager.

## Explicit non-goals

- Do **not** use Mastra vector/RAG as the materials index (`@syraa/context` owns retrieve).  
- Do **not** store prefs/rules only inside Mastra WM without `@syraa/memory` HITL.  
- Do **not** put product logic in Mastra workflows until the thin agent path is Mastra-native.  
- Do **not** start sandbox / FS / browser / skills until Wave 1 lands.

## Migration phases

### Phase A — Agent surface + storage (Wave 1 start)
- Harden `generate` / `stream`, tools, structured output.  
- Add processors where we currently hack prompts.  
- Add `@mastra/memory` + **Postgres storage** on existing Syraa DB.  
- Chat API: accept `threadId`; drop client history as model input SoT.

### Phase B — Session seeds via working memory
- On new thread: `listMaterialsLayer1` → `updateWorkingMemory` (thread scope, read-only for materials).  
- Remove DIY materials bootstrap + `pinSessionSeeds`.  
- New chat = new `threadId`.

### Phase C — UI threads
- Sidebar: list Mastra threads for `resource=userId`.  
- Resume loads Mastra messages into the visible transcript.

### Phase D — Product memory bridge
- Keep `@syraa/memory` pack in instructions *or* map via processors.  
- Escalate materials depth via tools → `@syraa/context`.

### Phase E — Deferred runtime polish
- Observability + Studio traces.  
- Observational Memory when threads get long.  
- Workflows for recipes.  
- Harness / AgentController if UI needs durable control.

### Phase F — Agent environment (Wave 3)
- Filesystem + browser tools (scoped, product-shaped).  
- Skills for kind / recipe playbooks.

## Success criteria (Wave 1)

- Refreshing the browser resumes a thread without losing model context.  
- No custom “seed message” protocol in chat history.  
- Mastra persists threads/WM in our Postgres.  
- `@syraa/context` / `@syraa/memory` remain Mastra-free packages.  
- Streaming + tools + structured output work through Mastra, not parallel DIY.
