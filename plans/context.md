# Brainstorm: Context system

**Package:** `@syraa/context` (store · retrieve · assemble)  
**Sibling writer:** `@syraa/ingest` (M4 worker — writes into the store)  
**Product:** Syraa  
**Siblings:** [`memory.md`](./memory.md) · [`harness.md`](./harness.md) · [`brainstorm.md`](./brainstorm.md) (index)

**Coverage:** brainstorm complete enough for this package. Open decision queue (D1–D5) settled 2026-08-29. Feasibility code: `scripts/heading_heuristics/`, `scripts/ingest/`.

---

## Problem this package solves

Users work on **their materials** (syllabi, papers, briefs, notes). Chatbots either ignore those files or stuff whole PDFs into the prompt. Syraa needs a materials brain that:

1. Processes each file **once**, carefully, off the chat path  
2. Keeps a **cheap** layer always available (what is this file?)  
3. Can **drill** into the right section when the task needs quotes or detail  
4. Stays **profession-agnostic** (syllabus today, complaint brief tomorrow) without forking the schema  

That is Context. It is **not** Memory (how this person likes to work) and **not** Drive (raw bytes).

---

## Boundaries

| Package | Owns | Must not |
|---|---|---|
| **Context** | Resources, topics, chunks, cards, retrieve, `assembleTurnPack` | Own chat history; own memory items; store file bytes; import Mastra |
| **Ingest (M4)** | Async job: extract → structure → chunks → embed → card | Run inside the user request / agent turn |
| **Memory (M7)** | Prefs, rules, methods, decisions | Know chunk indexes |
| **Drive (M2)** | S3 bytes + paths | Implement RAG |
| **Mastra (M9)** | Wire hooks and tools | Reimplement pack or ingest |

**Settled (user):** Domain packages are pluggable SDKs. Mastra only calls them. Context and Memory are siblings; assemble may *inject* a memory pack but does not store memory rows.

### Recommended layout

```
@syraa/context
  ├── store/        # Postgres units + migrations
  ├── retrieve/     # pluggable catalog / semantic / hybrid
  └── assemble/     # buildTurnPack

@syraa/ingest    # worker process; depends on Drive + Context store APIs
```

---

## Design metaphor: the pyramid

**Settled (user intent):** Do not reload full files for simple asks. Build a usable low-token layer at ingest; promote detail only when needed.

Real-world anchors: library card catalog vs opening every book; executive brief + appendix; annotated bibliography vs full PDFs.

| Layer | What it is | When it enters the model |
|---|---|---|
| **L0 Blob** | Original file on Drive | Never in the prompt (download / re-parse / audit only) |
| **L1 Chunks** | Bridge summaries + leaf full text + embeddings | Only on retrieve / escalate |
| **L2 Card** | One-pager per resource (summary, outline, entities) | Almost every turn that touches the file |
| **L3 Brief** | Subproject / work brief (hierarchy + memory) | Every scoped session turn |
| **L4 TurnPack** | Budgeted assembly for one LLM call | Every agent step |

**Default turn:** L3 + L2 + Memory always-on pack.  
**Escalate:** pull L1 (preferably via topic → evidence) when the user needs quotes, citations, or fine detail.

Pushback handled: “summary only forever” fails researchers → layered access, not summary-only. Regenerating giant summaries every message wastes money → cards durable until `content_hash` changes; packs ephemeral.

---

## What we store

Four persisted units. Catalog-by-filename can query `context_resources` (Drive catalog details live in harness).

| Unit | Table | Written when |
|---|---|---|
| **Resource** | `context_resources` | File registered (upload, agent write, import) |
| **Topic** | `context_topics` | Ingest |
| **Chunk** | `context_chunks` | Ingest |
| **Card** | `context_cards` | Ingest |

**Not in this store:** session messages, `memory_items`, raw S3 objects, TurnPack bodies.

**Settled (user, D3):** No `context_pack_snapshots` in v1. Packs are ephemeral; debug via request/trace logs. Meta-only snapshots can wait until support needs them.

### Relations

```
User
 └── context_resources (drive_key → M2)
       ├── context_topics (tree per resource; optional subproject merge later)
       ├── context_chunks (bridge + leaf, hang on topics)
       └── context_cards (1:1 with resource in v1)
```

Assume one primary `subproject_id` per resource in v1 (many-to-many junction later if needed).

---

## Topic tree

**Settled (user, D1):** v1 storage is the **`context_topics` table** — adjacency (`parent_id`) plus materialized `path`. Soft cross-links via `related_topic_ids`. **No** general `kg_nodes` / `kg_edges` day one.

A knowledge *graph* remains the conceptual north star (nodes, typed edges). When entities/cites demand it, migrate topics → nodes and express hierarchy as `parent_of` behind the **same SDK** (`getTree`, `getEvidence`). Do not run two parallel trees.

### Why topics exist

Flat chunks answer “find similar text.” Topics answer “what’s the map of this document?” and “give me week 4 without the whole PDF.” The tree is the navigable spine; chunks are evidence.

### Schema: `context_topics`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | string | tenancy |
| `resource_id` | uuid nullable | null if subproject-merged node |
| `subproject_id` | string nullable | matter-level merge (optional job) |
| `parent_id` | uuid nullable | null = root |
| `path` | string | e.g. `/bio101/genetics/meiosis` |
| `ordinal` | int | sibling order |
| `title` | string | |
| `summary` | string nullable | short blurb only — **no** full prose bodies on topics |
| `depth` | int | 0 = root |
| `related_topic_ids` | uuid[] | soft links; never used as parent |
| `embedding` | vector optional | topic search by meaning (later OK) |
| `source` | enum | `extracted` \| `merged` \| `user_edited` |
| `status` | enum | `active` \| `superseded` \| `deleted` |
| `merged_from_ids` | uuid[] nullable | lineage when merged |
| `created_at` / `updated_at` | timestamptz | |

Do **not** rely on denormalized `chunk_ids` as source of truth; derive evidence with `WHERE parent_topic_id = ?`. Optional cache later.

**Lean:** drop `card_id` on topics — card is already 1:1 with `resource_id`.

### Invariants

1. At most one parent (tree, not multi-parent DAG)  
2. No cycles  
3. Soft max depth ~6 at ingest (platform guardrail)  
4. Prefer **one root per resource** (document title); if ingest returns several tops, stitch under a synthetic root for UI  
5. Empty nodes allowed (heading with no chunks yet)

### Still open (small)

- **Path on rename:** A — rebuild `path` for node + descendants (recommended) vs B — immutable slug, title display-only  
- Subproject-merged trees: ship in v1 or defer  

### Topic APIs

```ts
topics.getTree({ resourceId | subprojectId })
topics.getNode(id)            // + children
topics.getSubtree(id)         // path prefix
topics.getEvidence(topicId)   // leaf/bridge chunks under node
topics.search({ userId, query, subprojectId? })
```

---

## Leveled detail: bridge and leaf chunks

**Settled (user):** A document is stored as **levels of detail**. Topics form the spine. Every chunk has a required `parent_topic_id`. Non-leaf layers hold **bridge** chunks that summarize a child and point at it. The deepest topics hold **leaf** chunks with full section text.

### Example

```
Topic: Biology (root)
  bridge chunks ──child_topic_id──► Topic: Chapter 2 "Genetics"
                                      │
Topic: Chapter 2 "Genetics"           │
  bridge chunks ──child_topic_id──► Topic: Section "Meiosis"
                                      │
Topic: Section "Meiosis"   (leaf topic)
  leaf chunks (full text)   child_topic_id = null
```

### Chunk roles

| Role | `child_topic_id` | `text` |
|---|---|---|
| **bridge** | set → next topic | summary / overview of that child |
| **leaf** | `null` | full content for this topic |

**Invariant:**  
`role = bridge` ⇔ `child_topic_id IS NOT NULL`  
`role = leaf` ⇔ `child_topic_id IS NULL`  
Bridge’s child topic’s `parent_id` equals this chunk’s `parent_topic_id`.

### Schema: `context_chunks`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | string | denorm for tenancy filters |
| `resource_id` | uuid FK | |
| `parent_topic_id` | uuid FK | **required** |
| `child_topic_id` | uuid FK nullable | bridge only |
| `role` | enum | `bridge` \| `leaf` |
| `ordinal` | int | order under parent topic |
| `text` | string | |
| `token_estimate` | int | pack budget math |
| `anchor` | jsonb | `{ page?, start?, end?, heading? }` |
| `embedding` | vector | |
| `content_hash` | string | |
| `created_at` | timestamptz | |

### Retrieval by level

| Need | Query |
|---|---|
| Doc overview | root → its bridge chunks |
| Drill into chapter | follow `child_topic_id` / open topic → its bridges |
| Full section | leaf topic → leaf chunks |
| Semantic search | embeddings filtered by `role` / depth / subtree |
| TurnPack escalate | highest useful level first; leaves only when quoting |

---

## Resource cards

Cards are the **cheap always-on** projection of a file (“what’s in week 3?” without the PDF).

### Schema: `context_cards`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | string | |
| `resource_id` | uuid FK unique | one card per resource in v1 |
| `card_type` | string | e.g. `generic`, `syllabus`, `paper`, `notes` |
| `title` | string | |
| `summary` | string | short prose (~200–800 tok when projected) |
| `outline` | jsonb | craft-shaped; soft |
| `entities` | jsonb | dates, people, topics — soft |
| `constraints` | jsonb | e.g. exam dates — soft |
| `projection` | text nullable | pre-rendered text for the pack |
| `version` | int | bump on re-ingest |
| `created_at` / `updated_at` | | |

### Modular card types — settled (user, D4)

Keep types **configurable without migrations**.

- **Store** stays one table + soft jsonb forever  
- **Configure** via a **pluggable registry** (Vault / seed kind packages register at boot):

```ts
cardTypes.register({
  id: 'syllabus',
  label: 'Syllabus',
  schema?: ZodOrJsonSchema,  // optional validate at ingest
  build(ctx): { outline, entities, constraints, projection, summary, title }
})
```

Ingest calls `registry.get(cardType) ?? generic`. Unknown professions get `generic` (summary + outline from the topic tree). New type = new module registration, not a new table. Pack prefers `projection`; recipes may read typed jsonb when they know the type.

---

## Resources

### Schema: `context_resources`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | string | tenancy |
| `drive_key` | string | S3 key / drive id (M2) |
| `path` | string | user-visible path |
| `name` | string | filename |
| `ext` / `mime` | string | |
| `size_bytes` | int | |
| `content_hash` | string | skip / rebuild ingest |
| `kind_id` | string nullable | |
| `subproject_id` | string nullable | primary matter |
| `tags` | string[] | |
| `status` | enum | `pending_ingest` \| `ready` \| `failed` \| `deleted` |
| `ingest_error` | string nullable | |
| `created_at` / `updated_at` | timestamptz | |
| `ingested_at` | timestamptz nullable | |

UI shows preparing → ready. Agent generation that needs the file waits for `ready` (or uses card-only if we later allow partial ready — open).

---

## Ingest worker

**Settled (user):** Ingestion is a deliberate, **async** step — extract, structure, embed, index, store. Not ad-hoc inside every chat turn.

**Settled (user):** Ingest is a **separate worker system** (not UI, not Mastra turn). One pipeline for:

- **User-generated** — uploads, imports  
- **System-generated** — agent writes to Drive → same job  

Trigger = new or changed resource / content hash — not who authored the bytes.

**Runtime (assumed):** App/Mastra **enqueue** only. Worker pulls and runs. Queue product (Inngest, Bull, …) chosen at build.

### Pipeline

1. Read bytes from Drive  
2. Extract text (+ page/heading anchors when possible)  
3. Propose outline: topics, parent/child, depth **N for this doc** (within soft max ~6)  
4. Write `context_topics`  
5. Write **bridge** and **leaf** `context_chunks`  
6. Embed chunks; update lexical index  
7. Upsert `context_cards` via card-type registry  
8. Set status `ready` or `failed`  
9. Idempotent on `content_hash` — skip or full replace  

**Not decided by ingest:** memory lessons, TurnPack contents, chat prompts.

**Fallback:** weak structure → shallow N + mostly leaf chunks.  
**HITL later:** user edits tree; re-ingest policy at build.

### How we decide topics (structure) — settled (user, D5)

**Algorithmic first** (feasibility exercised on real PDFs in-repo):

1. **Embedded bookmarks** if the PDF outline is usable (≥2 entries)  
2. Else **printed Table of Contents** — detect “Table of Contents” pages, parse title + page rows, infer depth (Roman / letter / number)  
3. Else **body heading heuristics** — font size, bold, numbering, stack-based tree; **exclude TOC pages** so they do not pollute candidates  
4. Else shallow fallback  

VLM → Markdown structure path is **parked** for later comparison.

**Settled (user):** Ingest decides **N** and which topics exist per document — not a fixed global “always 3 levels.”

### Chunk / embed / rank policy — settled (user, D5)

High-level defaults; exact model IDs and index engine params at build.

| Concern | v1 default |
|---|---|
| Leaf size | ~300–800 tokens per leaf chunk; split on paragraph/heading; small overlap OK |
| Bridge | one summary chunk per child topic (not a sliding window of the parent) |
| Embed | all bridge + leaf chunks; optional topic title+summary vectors later |
| Index | vector required; light lexical (FTS) day one or soon — hybrid helps names/codes |
| Rank | hybrid score → filter by `role` / topic subtree when escalating; respect TurnPack budget |
| Re-ingest | on `content_hash` change: replace topics, chunks, and card for that resource |

---

## Assemble: TurnPack

**Settled (user, D2):** Default pack budget ≈ **8k tokens** (memory cards + resource cards + optional chunks). Recipes may raise (e.g. long draft / heavy cite → 12–16k). Exact tokenizer at build.

**Hard trim rules:** never drop subproject brief or primary resource card; drop lowest-relevance chunks first; then older optional memory slices — never drop hard rules from Memory A if Memory defines them as sticky.

### Build order

1. Identity (session / kind / subproject labels) — tiny  
2. **Memory A** — `memory.getPack(...)` including `open_loops`  
3. Linked **resource cards** for this subproject  
4. Stop if under budget  
5. **Escalate** retrieve only if triggers fire  

### Escalate triggers

| Trigger | Call | Inject |
|---|---|---|
| Need quotes / detail | content / topic evidence search | top-k chunks (+ paths) |
| Find file by name | catalog search | file hits |
| Craft step (“draft quiz”) | `memory.recall` | methods / rules |
| “What did we decide…” | `memory.recall` on subproject | decisions |
| Simple edit (“shorten this”) | nothing | A pack + cards enough |

**Stance:** default is cheap pack only. Never “search everything every turn.”

### API

```ts
// @syraa/context
assembleTurnPack({
  userId, kindId, subprojectId, sessionId,
  userMessage,
  stepIntent?,       // from recipe step when known
  budgetTokens?,     // default ~8000
  memoryPack,        // from M7 — injected, not owned
}): Promise<TurnPack>
```

```ts
type TurnPack = {
  system: string | blocks[]
  memorySection: string
  cards: { resourceId: string; projection: string }[]
  chunks: { chunkId: string; text: string; path: string; anchor?: object }[]
  meta: {
    tokenEstimate: number
    budgetTokens: number
    includedIds: {
      resourceIds: string[]
      chunkIds: string[]
      cardIds: string[]
      memoryItemIds: string[]
    }
    retrieved: boolean
  }
}
```

Prefer server-side escalate inside `assembleTurnPack` when `stepIntent` is known (recipes). Prefer tools in open chat when the model must decide to look something up.

---

## Retrieval

Pluggable retrievers registered at boot:

```ts
interface ContextRetriever {
  kind: 'catalog' | 'semantic' | 'hybrid'
  search(req: RetrieveRequest): Promise<RetrieveHit[]>
}
```

| Kind | Answers |
|---|---|
| **catalog** | Where is this file? (name / path / type / subproject) |
| **semantic** | Which passages / topics match meaning? |
| **hybrid** | Blend lexical + vector (default when both exist) |

When structure exists, prefer **topic hit → `getEvidence`** over raw chunk soup.

Optional thin `@syraa/search` (M3) can wrap the same indexes; ingest writes, context/tools read.

```ts
type RetrieveHit = {
  unit: 'resource' | 'chunk' | 'card' | 'topic'
  id: string
  score: number
  resourceId?: string
  path?: string
  text?: string
  anchor?: { page?: number; heading?: string }
  meta?: Record<string, unknown>
}
```

---

## Mastra wiring (thin)

| Hook | Uses |
|---|---|
| before `generate` | `context.assembleTurnPack` (+ `memory.getPack`) |
| tool: search my materials | `context.retrieve` / search |
| tool: read / write file | Drive (M2); on write → `ingest.enqueue` |
| after `generate` | `memory.ingestLessons` — **not** context |

---

## Settled decisions (this package)

| ID | Topic | Settlement |
|---|---|---|
| **D1** | Graph storage | `context_topics` only in v1; no `kg_*` tables; migrate later behind same SDK |
| **D2** | TurnPack budget | ~8k default; recipes may raise; never drop brief / primary card |
| **D3** | Pack snapshots | none in v1 — packs ephemeral |
| **D4** | Card types | soft jsonb store + pluggable registry; no per-craft tables |
| **D5** | Chunk / embed / rank | algorithmic structure first; leaf ~300–800; bridge per child; embed all chunks; vector + FTS; re-ingest on hash |

---

## Still open / deferred

| Item | Notes |
|---|---|
| Path-on-rename | A rebuild paths (lean) vs B immutable slug |
| Single vs multi root | lean one root per resource |
| Drop `card_id` on topics | lean drop |
| Subproject topic merge | optional later job + HITL |
| Embed model / dims / HNSW / RRF | build time |
| Queue product | Inngest vs Bull vs other — build time |
| Partial ready (card before embeds) | optional UX later |
| VLM structure path | parked |
| Neo4j | rejected for v1 |

---

## Feasibility in this repo

| Script area | Purpose |
|---|---|
| `scripts/heading_heuristics/` | Bookmarks, printed TOC, font heuristics → topic tree |
| `scripts/ingest/` | PDF → topics + bridge/leaf chunks → JSON artifact (no DB/embed yet) |

Use these to validate structure quality on real PDFs before wiring Postgres and workers.

---

## Out of scope for this file

| Concern | Doc |
|---|---|
| Kind / subproject / HITL / fork | [`harness.md`](./harness.md) |
| Drive layout, GSuite, tool names | [`harness.md`](./harness.md) |
| Memory tables, lessons, recall HITL | [`memory.md`](./memory.md) |
| Mastra vs AI SDK framework pick | [`harness.md`](./harness.md) |

---

## Notes for architect / implementor

1. Ship Context store + Ingest worker before polishing every card type — `generic` is enough day one.  
2. Enforce tenancy on every query (`user_id`).  
3. Keep assemble trim logic in one place; do not duplicate in Mastra.  
4. Success signal for ingest: tree + bridges answer “what’s in this doc?” without leaf text; leaves cite cleanly when escalated.  
5. Do not block v1 on Neo4j, VLM structure, or per-profession card tables.
