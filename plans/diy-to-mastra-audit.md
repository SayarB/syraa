# DIY → Mastra switch audit (repo as of 2026-09-01)

**Rule:** Only keep DIY if (a) we explicitly decided Mastra is wrong for it, or (b) Mastra’s equivalent is broken/unusable. Otherwise switch.

**Explicit keep (ours):** `@syraa/memory` (+ harness `lessons.ts` / Memory UI HITL), `@syraa/context`, ingest worker, product Postgres tables, HTTP API shell, React desk UI.

---

## Switch list (DIY today → Mastra equivalent)

| # | What we DIY today | Where | Mastra equivalent | Why switch |
|---|---|---|---|---|
| 1 | Client-owned chat transcript as SoT | `apps/web` `history` state; POST `/api/chat` body `history` | Mastra Memory message history (`thread` + `resource`) | Refresh loses context; multi-device impossible; we re-send full history every turn |
| 2 | Server trusts client history for model input | `chat.ts` → `runChatTurn({ history })` | `agent.generate/stream(msg, { memory: { thread, resource } })` | Server should load messages from Mastra storage |
| 3 | Materials “bootstrap” fake assistant message | `buildMaterialsBootstrapMessage`, `sessionContext` in `chat.ts` + web | Thread **working memory** (`updateWorkingMemory`, prefer read-only) | Pollutes transcript; needs pin hacks; not how session scratchpads work |
| 4 | Bootstrap detection in history | `historyHasMaterialsBootstrap` | WM exists on thread (or seed once at thread create) | Protocol smell (`[syraa:materials-overview]`) |
| 5 | Context-window pin + slice | `pinSessionSeeds` (keep seeds + last 40) | Memory `lastMessages` (+ processors later) | Framework windowing; delete pin |
| 6 | No Mastra storage on instance | `mastra/index.ts` — agents only, no `storage` | `@mastra/pg` (same Postgres) | Threads/WM need persistence |
| 7 | Agent has no Memory configured | `syraa-agent.ts` — Agent without `memory:` | `new Memory({ storage, options })` on Agent / Mastra | Enables history + WM |
| 8 | Chat API has no `threadId` | `chatRequestSchema` / `/api/chat` | Accept/create `threadId`; map `userId` → `resource` | “New chat” = new thread |
| 9 | UI “New chat” only clears local state | `startNewChat()` in `App.tsx` | Create new Mastra thread; optional list/resume threads | Real sessions |
| 10 | Non-streaming chat only | `agent.generate` in `llm.ts` | `agent.stream` (+ structured output if supported) | Better UX; Mastra path |
| 11 | No tools on agent | `createSyraaAgent` — no tools | `createTool` → `@syraa/context` expand/search | Deeper materials without stuffing prompts |
| 12 | System prompt rebuilt by hand each turn | `buildSystemPrompt(memoryItems)` passed as `instructions` | Keep **content** from `@syraa/memory`, but inject via Agent `instructions` / **processors** (Mastra), not parallel prompt DIY beyond the pack | Pack data stays ours; assembly uses Mastra hooks |
| 13 | Double-parse structured output | `structuredOutput` + `turnResultSchema.safeParse` | Prefer Mastra structured output as SoT; thin validate only if needed | Already mostly Mastra — clean up |
| 14 | Dead / legacy JSON helpers | `parseTurnJson`, `turnResultJsonSchema` if unused by generate path | Drop once confirmed unused | Reduce DIY surface |

---

## Not switching (explicit)

| Concern | Why keep ours |
|---|---|
| Prefs/rules/methods/decisions + confirm/dismiss | Product Memory — decided no Mastra |
| `applyLessons` → `@syraa/memory` | Domain write path after model returns lessons |
| `/rule` `/pref` slash commands | Product UX on Memory service |
| Materials index / L1 outline / retrieve | `@syraa/context` — not Mastra RAG |
| PDF ingest queue/worker | Async product pipeline |
| Custom HTTP server + static SPA | App shell (Mastra server optional later) |
| Upload / job status APIs | Product, not agent runtime |

---

## Deferred (Mastra exists; we chose later)

| Concern | Note |
|---|---|
| Observability / Studio | Wave 2 |
| Workflows / harness / AgentController | Wave 2 |
| Filesystem / browser / skills | Wave 3 — after this switch list |

---

## Delete targets once Mastra path works

- `MATERIALS_BOOTSTRAP_PREFIX` protocol  
- `buildMaterialsBootstrapMessage` / `historyHasMaterialsBootstrap` / `pinSessionSeeds`  
- `sessionContext` on chat response + client merge  
- Request `history` as model SoT (UI may still cache display messages from Mastra)  
- Related tests in `harness.test.ts` for pin/bootstrap  

---

## Done-when (Wave 1)

1. Chat turn: only `userId` + `threadId` + `message` required for model context.  
2. Materials L1 lives in thread WM, not in message history.  
3. Mastra storage on shared Postgres.  
4. Stream + tools + structured output go through the Agent.  
5. No pin/bootstrap helpers left in the hot path.
