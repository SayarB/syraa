# Validations: Semantic materials search (Phase 04)

Reviewer checks each item. Every item is pass/fail with evidence (test name, file:line, or command output).

## Functional

- **V1 Store API.** `ContextStore.searchMaterials(userId, { query, limit?, resourceIds?, mode? })` exists, is exported from `@syraa/context`, and returns `{ hits, modeUsed, semanticSkippedReason? }` with the `RetrieveHit` fields from plan.md.
- **V2 Lexical.** A proper-noun query ("Chroma") returns the chunk containing it (DB test). Multi-word queries use OR semantics, so a chunk with only one of the terms can still match.
- **V3 Empty is honest.** A query for a term in no chunk ("madverse") returns `hits: []` with no error (DB test). The tool result carries a `note` saying the materials don't mention it.
- **V4 Semantic safety.** Semantic scoring runs only with a remote embedder. Chunks whose vector length ≠ query vector length are skipped. Hash/none providers drop to lexical. Embedder failure drops to lexical with `semanticSkippedReason: "embed_failed"` and does not throw (tests).
- **V5 Hybrid.** RRF fuses lexical and semantic lists, and a chunk ranked by both beats single-list chunks (unit test). With a fake embedder, the exact-token chunk ranks above an unrelated bridge chunk (DB test).
- **V6 Scoping.** Results are always limited to `userId` and `status='ready'` resources; `resourceIds` narrows further. Another user's chunk never appears (DB test).
- **V7 Tool.** `search_materials` is registered in `syraaTools` with `{ query, limit?, documentName? }`. `documentName` resolves via `resolveResourceIdByName`, and an unknown name returns `{ error, availableDocuments }`. It calls `rememberToolResult` (harness test).
- **V8 Prompt.** `SYRAA_BASE_INSTRUCTIONS` lists `search_materials` and routes content/entity/cross-doc questions to it first. The working-memory blurb has the same hint. The existing list/read guidance still works for "list my docs" and "read section X of Y".
- **V9 No regression.** `list_materials` and `read_materials_section` behavior is unchanged, and existing harness/context tests pass.

## Safety / quality

- **V10 SQL safety.** All user input reaches SQL as bound parameters (drizzle `sql` template). ILIKE patterns escape `%`, `_`, and `\`. tsquery terms are restricted to `[\p{L}\p{N}]+`, so there's no tsquery syntax injection or syntax error on punctuation-only input.
- **V11 Boundaries.** `@syraa/context` doesn't import Mastra. There's no Mastra vector/RAG usage. Retrieval logic lives in `@syraa/context`, and the harness is a thin tool.
- **V12 Observability.** One log line per search with mode requested/used, term count, lexical/semantic candidate counts, hit count, and top resource ids. Query text is truncated to ≤ 80 chars and API keys are never logged.
- **V13 Deploy.** The `compose.yaml` API service passes `EMBEDDING_*` matching the worker defaults, and `.env.example` documents it.

## Commands (must pass)

- `npm run typecheck` (root, or each touched package)
- `npm test` for `@syraa/context` and `@syraa/harness` (DB tests may skip without `DATABASE_URL`; say so in the report)
- `npx biome check` on touched files

## Acceptance (manual, if DB + chat provider available; else mark N/A with reason)

- A1: "What do you know about chroma db?" → `search_materials` is called ≤ 2 times, and the answer cites matching snippets without reading unrelated sections.
- A2: "What do you know about madverse?" → search runs and the reply says no materials mention it, with no PDF tree walk.
- A3: "List my documents" and "read section X of doc Y" still work.
