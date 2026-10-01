# Review report: Semantic materials search (Phase 04)

## Round 1: `changes_required`

**Commands**
- `npm run typecheck --workspaces`: pass (0 errors)
- `@syraa/context` tests with `DATABASE_URL` (local compose Postgres): 24/24 pass, including 6 DB tests
- `@syraa/harness` tests: 52/52 pass
- `biome check` on touched files: clean. Note that `biome check .` already fails on `main` in 15 untouched files (format/import-order drift). That is out of scope, and those files were reverted after an accidental `--write`.

| # | Validation | Result | Evidence |
|---|---|---|---|
| V1 | Store API + exports | pass | `store.ts` `searchMaterials`, `index.ts` exports |
| V2 | Lexical, OR semantics | pass (with defect B1) | DB tests "finds a proper noun…", "uses OR semantics" |
| V3 | Honest empty | pass | DB test "honest empty"; tool test "adds an honest note" |
| V4 | Semantic safety | pass | dims guard `store.ts` `semanticCandidates`; DB tests "skips mismatched dims", "embedder throws"; `createQueryEmbedder` null for hash/none |
| V5 | Hybrid RRF | pass | unit RRF test; DB hybrid test |
| V6 | Scoping | pass | DB tests: other user, pending resource, `resourceIds` |
| V7 | Tool | pass | `search-materials-tool.test.ts` |
| V8 | Prompt | pass | `prompt.ts` Materials tools section; WM blurb |
| V9 | No regression | pass | existing harness tests unchanged and green |
| V10 | SQL safety | pass | bound params; LIKE escaping unit test; hostile-input DB test |
| V11 | Boundaries | pass | no Mastra import in `@syraa/context` |
| V12 | Observability | pass | `[context.search]` line (visible in DB test output) |
| V13 | Deploy | pass | `compose.yaml` api env; `.env.example` |
| A1–A3 | Manual chat replay | not run | no chat or embedding provider key in `.env` on this machine |

### Blocking

- **B1: ILIKE on short terms creates false "exact" hits.** `toLikePatterns(terms)` applies `%term%` to every term, including 2–3 char ones. "chroma db" makes `%db%` match "sandbox" (verified in psql: `'…sandbox…' ILIKE '%db%'` = true, while FTS = false). Those rows are then tagged `matchedBy: lexical`, so the tool reports `exactMatch: true` and the agent treats noise as evidence. That undermines V2/V3 honesty. **Fix:** only use ILIKE for terms ≥ 4 chars (FTS still covers short tokens as whole words). Add a DB test showing that "chroma db" doesn't return a "sandbox" chunk.

### Non-blocking

- **N1: Unplanned but small addition.** There is an `exactMatch` flag per hit, plus a "loose matches" note when no hit is lexical. It's justified: with a real embedder, cosine always returns nearest neighbours, so "madverse" would otherwise yield confident-looking unrelated hits. This is needed for V3 in hybrid mode. Accept it and note it in the plan follow-ups.
- **N2: Semantic scan cost.** Every search loads all same-dim embeddings for the user (JSONB) and scores them in-process. That's fine at current scale (plan A2). pgvector is the follow-up.

### Follow-up (outside this diff, important)

- **F1: The ingest worker likely never produces real embeddings under compose.** `compose.yaml` passes `EMBEDDING_MODEL: ${EMBEDDING_MODEL:-}` to the worker. That sets it to an empty string, and Python's `os.environ.get("EMBEDDING_MODEL", default)` returns `''` (verified). So the worker sends `model: ""`, the provider errors, and it silently falls back to `hash-64` vectors. Result: in a compose deploy, semantic search finds no same-dim vectors and runs lexical-only (safely, via the V4 guard). Fix in the worker (`or` instead of the `.get` default) and re-ingest. That's a separate task. The TS side already treats empty strings as unset.

---

## Round 2: `pass`

**B1 fixed.** In `store.ts`, `MIN_LIKE_TERM = 4`, so ILIKE only applies to terms ≥ 4 chars and shorter terms are FTS-only (whole-word).
- New DB test "keeps short terms FTS-only and substring-matches long ones":
  - `"chroma db"` returns only the Chroma chunk, not the "sandbox" chunk.
  - `"distrokid"` still finds the chunk containing `distrokid.com`, which FTS alone misses.
- The test is verified to fail with the guard disabled (`MIN_LIKE_TERM = 0` → 1 failed) and to pass with it.

**Commands (re-run)**
- typecheck, all workspaces: 0 errors
- `@syraa/context`: 25/25 pass (7 DB tests against compose Postgres)
- `@syraa/harness`: 52/52 pass
- biome on touched files: clean

**Still open:** A1–A3 manual chat replay was not run (no provider keys on this machine). N1/N2 accepted. F1 (worker `EMBEDDING_MODEL=""` → hash fallback) is a separate follow-up.

Rounds used: 1 of 3.
