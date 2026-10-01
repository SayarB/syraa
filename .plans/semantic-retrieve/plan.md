# Plan: Semantic materials search (Phase 04)

**Status:** pending-approval · unphased · source: `plans/semantic-retrieve.md` (design), `plans/context.md` §Retrieval  
**PRD:** none (user: no PRD)

## Goal

The agent can search **all** ingested documents by name, topic, or phrase with one tool call (`search_materials`). It gets back ranked passages with document, section, and snippet, so "what do you know about X?" is answered from hits, or honestly reported as "nothing in your materials mentions X", instead of walking the PDF tree.

## Non-goals

- Mastra RAG / Mastra vector store (`@syraa/context` owns retrieval).
- pgvector column, HNSW, or GIN FTS index (follow-up; v1 is Postgres-only with no migration).
- Auto-injecting hits into every turn (`assembleTurnPack`, later).
- Blocking or deduping `list_materials` / `read_materials_section` beyond the existing `rememberToolResult`.
- Re-ingest or content fixes; card `entities` search (cards are not populated by ingest today).

## Reuse (searched)

- `packages/context/src/store.ts`: `createContextStore(db)` is the single store factory. We extend it, with no new package.
- `services/ingest-worker/syraa_ingest/embed.py`: `resolve_embedding_config()` is the source of truth for provider/model/base_url. The TS query embedder **mirrors** it (same env vars, same defaults). There is no existing TS embedding code (grepped `embed` across `packages/`, `apps/`).
- `packages/harness/src/mastra/tools/materials-tools.ts`: tool pattern (`createTool`, `getChatRunContext`, `getContextStore`, `rememberToolResult`).
- `resolveResourceIdByName` in `packages/harness/src/materials-retrieve.ts`: reused to scope by `documentName`.
- `packages/memory/tests/persist.test.ts`: `hasDb` skip pattern for DB-backed tests.

## Key constraints discovered

1. **Embedding mismatch risk.** Ingest may write real vectors (Fireworks nomic 768d / OpenAI 1536d) **or** hash stubs (64d, including silent `hash-fallback` on network errors). Hash vectors are not semantic. So:
   - Semantic runs only when the query embedder resolves to a **remote** provider (fireworks/openai). With `hash`/`none`, it silently drops to lexical.
   - Only chunks whose `jsonb_array_length(embedding)` equals the query vector's length are scored. This skips hash-fallback chunks and cross-model leftovers.
   - An embedder failure at query time falls back to lexical (logged), and never throws to the agent.
2. **API container env.** `compose.yaml` `api` service doesn't pass `EMBEDDING_*`. Add them so the query embedder matches the worker.

## Code shape

### 1. `packages/context/src/retrieve/embed.ts` (new)

```ts
export type QueryEmbedder = (text: string) => Promise<number[] | null>;

export type EmbeddingConfig =
  | { provider: "none" | "hash" }
  | { provider: "fireworks" | "openai"; model: string; baseUrl: string; apiKey: string };

/** Mirrors services/ingest-worker/syraa_ingest/embed.py resolve_embedding_config. */
export function resolveEmbeddingConfig(env = process.env): EmbeddingConfig;

/** null when provider is none/hash (non-semantic) or the key is empty. */
export function createQueryEmbedder(env = process.env): QueryEmbedder | null;
// POST `${baseUrl}/embeddings` { model, input: [text] } → data[0].embedding
// 15s timeout via AbortSignal.timeout; non-2xx → throw (caller falls back)
```

### 2. `packages/context/src/retrieve/search.ts` (new): pure helpers, unit-testable without a DB

```ts
export type RetrieveMode = "hybrid" | "lexical" | "semantic";

/** Split on non-letter/digit (unicode), lowercase, drop len<2, dedupe, cap 12 terms. */
export function queryTerms(query: string): string[];

/** "a | b | c" for to_tsquery('english', …) — OR semantics; terms are already [\p{L}\p{N}]+. */
export function toOrTsQuery(terms: string[]): string | null;

export function cosineSimilarity(a: number[], b: number[]): number;

/** Reciprocal rank fusion (k=60) over ranked id lists → id → fused score, sorted desc. */
export function reciprocalRankFusion(lists: string[][], k?: number): Array<{ id: string; score: number }>;

/** ~280-char window centred on the first term hit; else leading text. Adds "…" when clipped. */
export function makeSnippet(text: string, terms: string[], maxChars?: number): string;
```

### 3. `packages/context/src/store.ts`: extend

```ts
export type SearchMaterialsInput = {
  query: string;
  limit?: number;            // default 8, clamp 1..20
  resourceIds?: string[];    // optional scope
  mode?: RetrieveMode;       // default "hybrid"
};

export type RetrieveHit = {
  chunkId: string;
  resourceId: string;
  documentName: string;
  sectionTitle: string;      // parent topic title (bridge chunk → child topic title)
  sectionPath: string;       // topic.path
  role: string;              // leaf | bridge | …
  snippet: string;
  score: number;             // fused (hybrid) or mode-native score
  matchedBy: ("lexical" | "semantic")[];
  anchor: Record<string, unknown>;
};

export type SearchMaterialsResult = {
  hits: RetrieveHit[];
  modeUsed: RetrieveMode;    // effective mode, e.g. hybrid→lexical when no embedder
  semanticSkippedReason?: "no_embedder" | "embed_failed" | "no_matching_vectors";
};

// ContextStore gains:
searchMaterials(userId: string, input: SearchMaterialsInput): Promise<SearchMaterialsResult>;

// factory:
export function createContextStore(
  db: ContextDb,
  opts: { embedQuery?: QueryEmbedder | null } = {},  // default: createQueryEmbedder()
): ContextStore;
```

Always filter: `chunks.user_id = userId` **and** resource `status = 'ready'` (join `context_resources`), plus optional `resource_id IN (...)`.

**Lexical** (one SQL, via drizzle `sql` template, parameterized):
```sql
SELECT c.id, ts_rank(to_tsvector('english', c.text), to_tsquery('english', $q)) AS rank
FROM context_chunks c JOIN context_resources r ON r.id = c.resource_id
WHERE c.user_id = $u AND r.status = 'ready' [AND c.resource_id = ANY($ids)]
  AND ( to_tsvector('english', c.text) @@ to_tsquery('english', $q)
        OR c.text ILIKE ANY($likePatterns) )     -- %term% per term; catches hyphenated/partial proper nouns
ORDER BY rank DESC, c.ordinal ASC
LIMIT $candidateLimit                             -- limit * 4
```
`likePatterns` escape `%`, `_`, and `\`. If `toOrTsQuery` returns null (no usable terms), lexical returns [].

**Semantic**: `vec = await embedQuery(query)`, then select `id, embedding` for user/ready/scope rows where `jsonb_array_length(embedding) = vec.length`. Compute cosine in-process, keep the top `limit * 4` with sim > 0. (Fine at current scale, ~hundreds of chunks. pgvector is a follow-up.)

**Hybrid**: RRF over [lexical ids, semantic ids], then take the top `limit`. If semantic is unavailable, the result is lexical with `modeUsed: "lexical"` and `semanticSkippedReason`.

**Hydrate** the final ids in one query: chunk text/role/anchor/parentTopicId/childTopicId, resource name, and topic title/path (bridge → child topic, else parent topic). Snippet via `makeSnippet`.

**Log** one line per call: `[context.search] mode=… used=… terms=n lexical=n semantic=n hits=n top=<resourceIds…>` (no query text beyond 80 chars).

Export new types and functions from `src/index.ts`.

### 4. `packages/harness/src/mastra/tools/materials-tools.ts`: new tool

```ts
export const searchMaterialsTool = createTool({
  id: "search_materials",
  description:
    "Search all ingested documents for passages matching a name, topic, or phrase. Use for 'what do you know about X', 'find mentions of X', and cross-document questions. Prefer this over list_materials + read_materials_section when the target document is unknown. Empty hits means the materials do not mention it.",
  inputSchema: z.object({
    query: z.string().min(1).max(300),
    limit: z.number().int().min(1).max(20).optional(),
    documentName: z.string().min(1).optional(),
  }),
  mcp: { annotations: { readOnlyHint: true, idempotentHint: true } },
  execute: async (input) => {
    // documentName → resolveResourceIdByName(listMaterialsLayer1) → resourceIds; unknown name → { error, availableDocuments }
    // store.searchMaterials(userId, { query, limit, resourceIds })
    // result = { query, hits: [{ documentName, section, snippet, score }], note? }  // note when hits empty
    // rememberToolResult("search_materials", input, result)
  },
});
// add to syraaTools
```

### 5. Prompt + working memory (prompt only, no code gates)

- `prompt.ts` → Materials tools section: add `search_materials` first, with the rule "content / entity / cross-doc questions → search_materials first; read_materials_section for a known doc/section; list_materials for 'what documents do I have'". Replace "call tools when you need fresher or fuller data" with a pointer to search. Adjust "Do not quote document body unless read_materials_section returned it" to "unless read_materials_section or search_materials returned it this turn".
- `materials-working-memory.ts`: add one blurb line with the same routing hint (read the file first; keep the format).

### 6. Deploy wiring

- `compose.yaml` `api.environment`: `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL`, `EMBEDDING_BASE_URL`, `EMBEDDING_API_KEY` with the same defaults as the worker block.
- `.env.example`: one comment saying the API uses the same `EMBEDDING_*` for query embedding.

### 7. Tests

- `packages/context/tests/retrieve.test.ts` (pure): `queryTerms`, `toOrTsQuery`, `cosineSimilarity`, `reciprocalRankFusion` (a doc ranked in both lists beats single-list docs), `makeSnippet`, `resolveEmbeddingConfig` (auto → fireworks/openai/none; hash → non-semantic; `createQueryEmbedder` null for hash/none).
- `packages/context/tests/search.db.test.ts` (skips without `DATABASE_URL`): seed user/resource/topics/chunks, including a 64d hash-embedded chunk and another user's chunk. Cover: lexical hit on the proper noun "Chroma"; a "madverse" query returns 0 hits; another user's chunk is never returned; a non-ready resource is excluded; an injected fake embedder ranks the exact-token chunk above an unrelated bridge; a mismatched-dim vector is skipped; embedder throws → `modeUsed: "lexical"`, `embed_failed`.
- `packages/harness/tests/materials-tools.test.ts`: `search_materials` is registered with the schema; execute with a mocked `getContextStore` / `getChatRunContext` returns mapped hits, returns the `note` on empty hits, and gives the unknown-documentName error.

## Order of work

1. `retrieve/search.ts` + unit tests
2. `retrieve/embed.ts` + unit tests
3. `store.searchMaterials` + DB test
4. Harness tool + tests
5. Prompt / WM lines, compose / env
6. `npm run typecheck`, `test`, `biome check` at root; manual replay if a DB + chat key is available

## Assumptions (labeled)

- A1: `english` text search config is fine for current (English) materials. Proper nouns survive stemming because it lowercases and doesn't alter unknown words meaningfully. ILIKE covers the rest.
- A2: In-process cosine over ≤ a few thousand chunks per user is acceptable latency for v1.
- A3: Sections are reported by topic **title** (human-readable), not the slug path. The path is included for debugging.
