# Plan: Semantic materials search (Phase 04)

**Status:** draft — pick up later  
**Trigger:** Thread `630ad805…` — user asked what Syraa knows about their company (`madverse`). Agent called `list_materials` ×6 and `read_materials_section` on an unrelated PDF section, then said it had no info. It never searched chunk embeddings.

---

## What happened (last thread)

| Step | Actual behavior |
|---|---|
| User | “I work at a company called madverse, what do you know about it?” |
| Agent tools | `read_materials_section` (Principles PDF, wrong section) → `list_materials` ×6 (stuck trying to reach `updateWorkingMemory`) |
| Agent reply | “I don’t have any information about Madverse…” |
| Postgres reality | 336 chunks, **all have embeddings**; **`madverse` appears in 0 chunks** |

So even perfect retrieval would return empty for `madverse` today — but the agent never tried search at all. It only knows how to **list doc names** and **walk the topic tree**.

---

## Root cause (system, not just model)

1. **No retrieve API** — `@syraa/context` store has `listMaterialsLayer1` + `getResourceTopicTree` only. Embeddings are written at ingest (`context_chunks.embedding`) but never queried.

2. **No search tool on the agent** — harness exposes only:
   - `list_materials` (L1 catalog)
   - `read_materials_section` (tree traversal + full section text)

3. **Prompt steers toward tree tools** — “Materials overview… call tools when you need fresher or fuller data” + working memory doc list → model lists/reads PDFs instead of searching by entity/name/topic.

4. **Phase 03 gap vs `plans/context.md`** — design already specifies `ContextRetriever` (`catalog` | `semantic` | `hybrid`) and agent tool `search my materials`. Not built yet.

---

## What should happen (target behavior)

For “what do you know about X?” / “find mentions of X across my docs”:

```
User names entity (company, person, concept)
  → search_materials({ query: "madverse" })   // hybrid: lexical + vector, all resources
  → top-k chunk hits with document + section + snippet
  → optional read_materials_section only if user needs full quote
  → answer from hits (or honestly “nothing in your vault mentions X”)
```

**Do not** require picking a document name first. **Do not** scan every section title in working memory.

Lexical match on proper nouns (`madverse`, `Matters`) should work even when embeddings are hash-stubbed in dev. Semantic match covers paraphrases (“music distribution platform” → Madverse docs).

---

## Implementation sketch

### 1. `@syraa/context` — `retrieve/` module

```ts
searchMaterials(userId, {
  query: string
  limit?: number          // default 8
  resourceIds?: string[]  // optional scope
  mode?: 'hybrid' | 'lexical' | 'semantic'
}): Promise<RetrieveHit[]>
```

**v1 query strategy (Postgres-only, no new infra):**

| Mode | Mechanism |
|---|---|
| **Lexical** | `ILIKE` / `to_tsvector` on `context_chunks.text` (+ optional `context_cards.entities`) |
| **Semantic** | embed query with same provider as ingest → cosine similarity on `embedding` jsonb (app-side or `pgvector` later) |
| **Hybrid** | RRF merge lexical + semantic top-k |

Return hits with: `resourceId`, `documentName`, `sectionPath` (from topic tree), `text` snippet, `score`, `anchor`.

**Follow-up (not v1):** pgvector column + HNSW index; FTS GIN index; entity index on `context_cards.entities`.

### 2. Harness — new agent tool

```ts
search_materials({ query, limit?, documentName? })
```

- Description: “Search all ingested documents for passages matching a name, topic, or phrase. Use for ‘what do you know about X’, ‘find mentions of X’, cross-doc questions. Prefer this over list_materials + read_materials_section when the target document is unknown.”
- Calls `store.searchMaterials` scoped to `userId` from chat context.
- `rememberToolResult` for turn-end fallback (same pattern as read/list).

Keep existing tools — tree read stays for “open section 3 of syllabus” style asks.

### 3. Prompt + working memory (light touch)

- Add `search_materials` to Materials tools section in `prompt.ts`.
- Working memory blurb: “For content questions across documents, use search_materials first; use read_materials_section for a known doc/section.”
- No code gates on tool choice — prompt only (per harness principles).

### 4. Tests

- Unit: lexical hit on seeded chunk text; hybrid ranks chunk with exact token above unrelated bridge text.
- Integration: mock store → tool returns hits; agent turn “what do you know about chroma” finds Principles chunk without listing all PDFs first.

### 5. Observability

- Log retrieve mode, query, hit count, top resource ids (for debugging bad tool loops).

---

## Out of scope for this phase

- Mastra RAG / Mastra vector store (use `@syraa/context` only)
- Blocking or deduping `list_materials` / `read_materials_section`
- Auto-injecting search results into every turn (`assembleTurnPack` — later)
- Re-ingest or fix missing company docs (product/content issue, not retrieval)

---

## Acceptance criteria

1. “What do you know about chroma db?” → `search_materials` called once (or twice max), answer cites matching snippets without reading unrelated sections.
2. “What do you know about madverse?” → search runs, agent reports **no vault mentions** (correct empty result), not a PDF tree walk.
3. No regression on “list my documents” / “read section X of doc Y” flows.

---

## Suggested order of work

1. `context/store.searchMaterials` (lexical first — ships same day)
2. Query embedding + cosine in-process (reuse ingest embed config)
3. `search_materials` tool + prompt line
4. Tests + manual thread replay on `630ad805…` and `307508b8…` (Chroma thread)
