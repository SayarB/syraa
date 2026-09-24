# Brainstorm: better document parsing (LiteParse / LlamaCloud lessons)

Status: **living** — updated as we talk. Not a plan; architect writes that later.

## Problem (what + why)

Ingest quality is the ceiling on every downstream feature (search_materials, lessons, bridge chunks).
Measured on a 16-page two-column paper (BERT, no bookmarks):

- Heading heuristics produced 87 "topics", mostly junk (`2018). These include…`, `arXiv:…`).
- Leaf text is 283k chars vs 64k in the doc (~4.4× duplication) — sections are sliced by
  whole pages, so every section sharing a page gets the full page.
- Tables come out one cell per line; figures come out as token soup; no OCR; PDF only.

## Direction (my stance)

**Local-first parsing, paid escalation later.** LiteParse (Apache-2.0, in-process Python, ~180 ms / 16 pages)
becomes the parse layer; LlamaCloud is at most an optional tier for pages we can't handle, never a hard dep.

## Working assumptions (defendable defaults — change any)

1. **Fix slicing first, independent of parser.** Cut section text at heading (page, y). This is a bug, not a feature.
2. **Structure source order:** bookmarks → printed TOC → LiteParse heading blocks → our font heuristics (last resort).
   Our heuristics stay but get demoted, not deleted.
3. **Chunk text = LiteParse markdown blocks** (tables kept as markdown tables, dehyphenated, headers/footers dropped).
4. **Anchors gain bboxes** (`{page, bbox[]}` per chunk). Consumer in v1 = search_materials returning page + bbox;
   UI highlight is a follow-up, not v1.
5. **Complexity flags stored per page** (needs_ocr, multi-column, table-likely, dense-graphics) even before we act on them —
   cheap and gives us data to decide routing.
6. **OCR:** LiteParse built-in Tesseract, eng only, only on pages flagged `needs_ocr` for scanned/image pages.
7. **Re-ingest reproducibility:** store `parser` + `parser_version` on the resource (LlamaParse's versioned-tier idea).
8. **Out of v1:** Office formats (LibreOffice bloats the image), VLM/LlamaParse escalation, card entity extraction,
   `view_page` tool.

## Known LiteParse weaknesses (seen in test)

- Run-in paragraph headings merged into body ("Pre-training data The pre-training procedure…").
- False-positive headings (author/affiliation lines on page 1).
- Over-eager hyphen join ("representation-learning" → "representationlearning").
- Subscripts flattened ("BERT_BASE" → "BERTBASE").

Mitigation assumption: filter LiteParse headings through a light sanity pass (length, trailing punctuation,
page-1 front matter) rather than trusting them raw.

## Ideas parked (useful, not v1)

- `view_page(resource, page)` tool → page PNG for a vision model (PyMuPDF renders; no new dep). Best fix for figures.
- Route `table-likely` / `dense-graphics` pages to a Fireworks vision model or LlamaParse "Cost Effective" (~3 credits/page).
- Office uploads via LibreOffice → PDF → same pipeline.
- LLM-free card fill from TOC + first section; LlamaExtract-style schema extraction with citations later.

## Part: Jev in the structuring pipeline

Jev (TypeSafe System One, already used for the lesson gate) only returns typed probabilities
and choices; it can't write text. So in ingest it can **adjudicate** decisions, and code or the parser still
**proposes** the candidates. Same pattern as the lesson gate: cheap signals propose → Jev decides on the
uncertain band → rare LLM call only where text must be written.

Pipeline shape (assumed):
```
parse (LiteParse blocks + geometry)
  → candidate headings (high recall: LiteParse headings ∪ font heuristics ∪ numbering)
  → sure ones skip Jev (bookmark/TOC match, clean "2.1 Foo" numbering)
  → Jev adjudicates the uncertain ones
  → tree build (numbering → font → Jev nesting only if still ambiguous)
  → slice by (page, y) → chunks
  → Jev tags each chunk's role (+ drop band)
```

### Uses ranked (my stance)

| # | Decision | Jev question(s) | Verdict |
|---|---|---|---|
| 1 | **Is this line a heading?** | `is_heading` noul + `line_kind` choice: section / front-matter (title, authors, affiliation) / run-in paragraph heading / caption / page chrome / list item / body | **v1.** Directly fixes the junk-topic problem. State = line + features relative to body (size ratio, bold, numbering, page, x-indent) + prev line + next ~200 chars. |
| 2 | **Chunk role** | `role` choice: concept / definition / example / exercise / proof-derivation / summary / references / boilerplate (TOC, license, acks, index) | **v1.** Tutor-relevant: retrieval can prefer definitions/examples, and the boilerplate/references band is **not embedded** (removes search noise). One call per chunk, async. |
| 3 | **Topic boundary where there are no headings** (lecture notes, transcripts, scanned docs) | `new_topic` noul on (end of para A, start of para B) | **v1.5.** Embeddings propose boundaries (similarity dips), Jev confirms. Only call at dips, not every paragraph. |
| 4 | **Nesting**: child / sibling / up vs previous heading | `relation` choice | **Only if eval shows numbering+font fail.** Most docs are resolved by numbering. |
| 5 | **Bridge quality**: does the lead paragraph describe the section? | noul | **Later.** No → conditional LLM summary for that bridge only (lesson-gate pattern). |
| 6 | **Doc type** → chunking profile (paper / textbook / slides / notes / contract / form) | choice, 1 call per doc | **Cheap, maybe v1** if profiles differ materially; else skip. |
| — | Leaf-vs-node / merge tiny sections | — | **Not Jev.** Size rules are deterministic and good enough. |

### Assumptions
- **Call budget:** only the uncertain band goes to Jev. Target ≤ ~60 heading calls + 1 per chunk per doc, run with
  bounded concurrency in the Python worker (plain HTTP client, same endpoint).
- **Fail open to heuristics**, not closed: ingest must never block on Jev (unlike the lesson gate, which fails closed).
- **Record** `structure_decider: heuristics | jev@<version>` on the resource so re-ingest is reproducible.
- **Tree fix alongside:** after slicing by (page, y), text between a parent heading and its first child becomes an
  **intro leaf** under the parent (today it's only reachable through page-duplication).

### Which headings are "uncertain" (assumed design)

Today one additive `heading_score` ≥ 4 decides. That's why BERT got junk: a wrapped line starting
`2018). These include…` matches the numbering regex (+3) and is short (+1) → 4 → topic.
Instead: collect **independent signals**, and a line is uncertain when they **disagree**.

Signals per line:
- **Anchor:** matches a bookmark or printed-TOC entry (fuzzy title + page).
- **Parser:** LiteParse block kind (heading / paragraph / list / caption…).
- **Typography:** font size vs body, bold, standalone line (whole block, gap above), no sentence-ending period, short.
- **Numbering fit:** number path continues the sequence (3 → 3.1 → 3.2 → 4). `2018)` doesn't fit; that's evidence *against*.
- **Repetition/position:** same text at same y on many pages → running header; top/bottom band; page number.
- **Caption pattern:** `Figure N:` / `Table N:` → caption, not heading.

Three bands:
- **Sure yes (no Jev):** anchor match; or numbering fits + typographically distinct + standalone;
  or LiteParse heading + font ≥ body + 1.5 + standalone.
- **Sure no (no Jev):** repeated header/footer, page number, caption, > 120 chars, mid-paragraph line
  (not first line of its block), or body font + not bold + no numbering + LiteParse says paragraph.
- **Uncertain → Jev:** at least one positive signal but signals disagree. Typical cases:
  LiteParse heading at body font (run-in heading or author line); bold short body-size line (term, label,
  table header); number-like prefix that breaks the sequence; page-1 front matter.

Budget: if uncertain > cap (e.g. 200/doc), send the ones closest to the boundary (most disagreeing
signals) and default the rest by heuristic. Doc with good bookmark coverage → skip Jev entirely.

**Calibrate the bands on the bookmark eval:** widen the uncertain band until sure-yes and sure-no are each
≥ ~98% precise against bookmarks. "Uncertain" = where the cheap rules are *measured* to be wrong, not a guessed number.

BERT walk-through (expected):
- `4.1 GLUE`: numbering fits + bold → sure yes.
- `2018). These include…`: paragraph, body font, breaks sequence, mid-block → sure no.
- `Jacob Devlin Ming-Wei Chang…`: LiteParse heading, big font, page 1, no numbering → Jev → front matter.
- `Pre-training data The pre-training procedure…`: bold run-in at body font → Jev → run-in heading →
  stored as a label on that chunk, **not** a new topic.

### Eval (free labels)
PDFs **with bookmarks** (arXiv LaTeX papers, most textbooks) are ground truth for headings and nesting.
Hide the bookmarks → run the pipeline → score heading precision/recall + tree edit distance vs bookmarks.
Compare: font heuristics alone vs + LiteParse vs + Jev. Same opt-in eval style as `evals/lesson-gate`.
Chunk-role labels need a small hand-labelled set (~100 chunks).

### Retrieval tie-in (parked, but it's why the tree matters)
Once the tree is clean, Jev can drive **navigational retrieval**: at a node, score "does child X (bridge text)
likely contain the answer to Q?" → descend or stop. Links to the parked "materials retrieve escalate vs skip"
item in `jev-system-one/brainstorm.md`.

## Cost (estimate, 2026-09-23)

Jev: **$0.042 / M input tokens, output free** (TypeSafe launch post). Our lesson-gate calls measured
~730–1,000 input tokens → **≈ $0.00004 per call**. Question text is most of each call's tokens, so ask all
questions for one item in one call (answers are free).

Per **100-page** textbook (~60k tokens of text):

| Step | Calls | Tokens | Cost |
|---|---|---|---|
| Heading adjudication (uncertain band only) | 60–200 | ~140k | ~$0.006 |
| Chunk role, 1 per chunk | ~140 | ~120k | ~$0.005 |
| Headingless topic boundaries (at embedding dips) | ~50 | ~30k | ~$0.001 |
| **Total** | ~250–400 | ~300k | **≈ $0.01** |

For comparison, same 100 pages: LlamaParse Cost Effective ≈ $0.38, Agentic ≈ $1.25, Agentic Plus ≈ $5.60;
an LLM structuring pass over the whole text ≈ $0.20–0.50. Local LiteParse/PyMuPDF/Tesseract = $0 (CPU only).

Real costs aren't money:
- **Ingest time:** ~300 calls × ~270 ms at concurrency 10 ≈ +8 s per 100 pages (async worker, user isn't waiting on chat).
- **Rate limits:** unknown. Needs bounded concurrency + backoff; fall back to heuristics on 429.
- **Re-ingest:** re-running the whole library after a question-wording change is a real (still small) bill;
  cache Jev answers by (item hash, question-set version).

## Settled (user, 2026-09-23)

- **Ingest stays a background job** — already true today (Redis queue → Python worker, status
  `processing` → `ready` / `failed`). Jev calls and OCR run inside that job; chat never waits on them.
- **Rate-limit Jev calls in the worker.** Assumed shape: one shared limiter per worker process
  (max concurrent calls + requests/sec from env), retry with backoff on 429/5xx, then **fall back to
  heuristics for that decision** (never fail the ingest). Log how many decisions fell back.
- Cost is acceptable (≈ $0.01 per 100 pages).

## Open threads

- Jev rate limits (not published) → start conservative (e.g. 8 concurrent), tune from logs.
- Does Jev accept batched states per call? If not, concurrency does the job.
