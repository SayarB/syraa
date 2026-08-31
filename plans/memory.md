# Brainstorm: Memory system (M7 / `@syraa/memory`)

Living notes for **learned behavior** memory (prefs, rules, methods, decisions) — not chat history, not materials RAG.

Sibling docs: [`context.md`](./context.md) · [`harness.md`](./harness.md)

---

### Working-style memory (M7 — deep dive)

- Settled (user): Remember **actions, decisions, methods** — not just documents; not raw chat as the brain.
- Settled (user): **M7 Memory is one pluggable package** (`@syraa/memory` or equivalent) — own schema, SDK, migrations. Mastra harness **plugs it in**; memory does **not** live inside Mastra and does **not** import Mastra.
- Settled: Scopes = **user** · **kind** · **subproject** · **session (ephemeral)**; vault facts live on resource cards (M5), not mixed into style memory.
- Settled: HITL for promoting methods into kind/user memory; visible edit/delete.
- Settled: Cross-kind fork never writes into source kind memory; clone gets its own target scopes.
- Assumed: structured store is source of truth; optional vectors only to *retrieve* old decisions by meaning — never one undifferentiated memory blob. (brainstormer)

**Package boundary:** exports SDK only — `getPack`, `recall`, `ingestLessons`, `confirmItem`, `dismissItem`, `listItems`, ensureMemory… Harness/UI are clients.


#### `memory` + `memory_items` tables (settled shape)

**Settled (user):** Items do **not** carry `user_id`. An item links to a **`memory` row**; that memory row is what connects to the user (and to kind/subproject as needed).

```
User
  └── memory (1 per scope container)
        ├── scope = user        → this user's profile memory
        ├── scope = kind        → this user's memory for kind K
        └── scope = subproject  → this user's memory for subproject S
              └── memory_items[]  (preference | rule | method | …)
```

**Parent table: `memories`**

| Field | Type | Why |
|---|---|---|
| `id` | uuid PK | Item FK target |
| `user_id` | string FK | Tenancy lives **here** |
| `scope` | enum `user` \| `kind` \| `subproject` | Which container |
| `kind_id` | string nullable | Required when scope=kind or subproject |
| `subproject_id` | string nullable | Required when scope=subproject |
| `brief` | text nullable | Playbook / matter summary for A-pack |
| `open_loops` | string[] nullable | Unresolved questions for this scope (esp. subproject) — **not** memory items |
| `created_at` / `updated_at` | timestamptz | |

**Constraint (assume):** unique `(user_id, scope, kind_id, subproject_id)` with nulls handled so one memory row per container (one user-scope memory; one per kind; one per subproject).

**Child table: `memory_items`**

| Field | Type | Why |
|---|---|---|
| `id` | uuid PK | |
| `memory_id` | uuid FK → `memories.id` | **Only** link upward; user via join |
| `type` | enum | `preference` \| `rule` \| `method` \| `decision` \| `fact_ref` |
| `text` | string | The memory body |
| `status` | enum | `pending` \| `active` \| `superseded` \| `dismissed` \| `deleted` |
| `source` | enum | `explicit` \| `distilled` \| `promoted` \| `forked` |
| `confidence` | enum | `high` \| `medium` \| `low` |
| `needs_confirm` | bool | HITL |
| `priority` | int | Pack order within type |
| `tags` | string[] | Soft recall labels |
| `why` | string nullable | Rationale |
| `evidence_session_id` | string nullable | |
| `evidence_message_ids` | string[] | |
| `evidence_artifact_key` | string nullable | |
| `fact_resource_id` | string nullable | `fact_ref` |
| `fact_path` | string nullable | `fact_ref` |
| `supersedes_id` | uuid nullable | → other item |
| `forked_from_id` | uuid nullable | → other item |
| `embedding` | optional | **B** recall |
| `created_at` / `updated_at` | | |
| `created_by` | `user` \| `system` | |
| `confirmed_at` / `confirmed_by` | nullable | |

**Queries**

- Always-on kind card: `memories` where user+kind → items `status=active` order by type priority  
- Tenancy: always `JOIN memories` and filter `memories.user_id` — never trust item alone  
- Dynamic recall: join memories (filter user/kind) + items (type/tags/vector)

**Ensure memory row:** on first lesson for a scope, create `memories` row if missing, then insert item with `memory_id`.

**Stance:** `memories` = scoped container (+ brief + user_id); `memory_items` = typed text rows. No `user_id` on items.

#### Memory item types (settled)

**Settled:** `memory_items.type` is a **closed enum** of exactly these **five**. LLM `lessons[].kind` maps into this set (`suggestion` is lesson-only → stored as `method` or `decision` + `needs_confirm`).

| `type` | Definition | Belongs on `memories.scope` | Example `text` |
|---|---|---|---|
| **preference** | Soft taste for how to talk/write — not process | usually `user` | "Keep answers short and plain." |
| **rule** | Hard constraint — must / never | `user` or `kind` | "Never invent citations." |
| **method** | Soft playbook for how to do the craft | usually `kind` | "Quizzes: 10 MCQ + 2 short answer." |
| **decision** | Binding choice for this matter until superseded | `subproject` | "Midterm on May 12; skip plants." |
| **fact_ref** | Pointer into vault/drive — don't paraphrase the doc | `subproject` | "Exam week → syllabus §Assessments" (+ fact_* fields) |

**Cut from item types: `open_question`** — not memory. Unresolved loops are **workflow state** on the subproject (e.g. `memories.brief` section, or `open_loops: string[]` on the `memories` row / subproject entity). When answered → write a **`decision`** item (and clear the loop). Don’t peer them with preference/rule/method.

**Closed enum (final):** `preference` \| `rule` \| `method` \| `decision` \| `fact_ref`

**Not types:** open_question (→ open_loops on subproject); suggestion (lesson → method/decision + HITL); goal/status/brief (`memories.brief`); habit/tip (`method`); tags (`tags[]`).

**Rule vs method vs decision:** rule = wrong if broken (always A); method = preferred process (top N in A); decision = this subproject only.

**Always-on pack order:** rule → preference → recent decision → top method → else B. (Open loops injected from subproject state, not as MemoryItems.)


#### Scopes (what belongs where)

| Scope | Owner key | Holds | Does NOT hold |
|---|---|---|---|
| **User** | `userId` | Cross-craft prefs: tone, length, language, “always cite”, accessibility | Matter-specific decisions; craft playbooks |
| **Kind** | `userId + kindId` | How *you* do this craft: structure defaults, checklists, “always exit ticket” | Biology exam date; Chem-only notes |
| **Subproject** | `userId + subprojectId` | Instance decisions, open questions, goals, milestone status, linked resource ids | Global tone; other subjects’ decisions |
| **Session** | `sessionId` | Live turns, current plan draft, uncommitted tool receipts | Durable truth (must distill out on confirm/end) |
| **Vault card** (M5) | `resourceId` | What’s *in* the materials | User habits |

#### Entity sketch (schema contract — tech choice at build)

```
UserProfile
  id, userId
  prefs: { tone?, length?, language?, cite_default?, … }  // flat JSON ok v1
  notes: MemoryItem[]     // explicit “always…” bullets
  updatedAt

KindMemory
  id, userId, kindId
  brief: string           // playbook summary (~200–400 tokens when projected)
  items: MemoryItem[]     // methods, defaults
  updatedAt

SubprojectMemory
  id, userId, subprojectId, kindId
  brief: string           // goal, status, what’s in flight
  items: MemoryItem[]     // decisions, open questions
  linkedResourceIds[]
  linkedArtifactKeys[]    // S3 keys
  updatedAt

MemoryItem
  id, scope, scopeId
  type: preference | rule | method | decision | fact_ref
  text: string            // human-readable, editable
  status: active | superseded | deleted
  source: explicit | distilled | promoted | forked
  confidence: high | medium | low
  evidence: { sessionId?, messageIds[], artifactKey? }
  createdAt, updatedAt, createdBy: user | system
  needsConfirm: bool      // HITL gate before active if system-proposed

SessionEphemeral (not durable memory table — session row)
  transcript / turns
  workingPlan
  pendingProposals: MemoryItem[]  // awaiting HITL
```

**Relations**

- `Kind 1—N Subproject`; memory rows hang off kind / subproject / user.
- `MemoryItem.evidence.sessionId` → session (audit), not the other way around.
- Fork: new `SubprojectMemory` (or kind) may copy *selected* items with `source=forked` + `forkedFromItemId`; source items unchanged.
- Promote: item copied/moved from subproject → kind (or user) only after HITL; original may stay or get `superseded` with pointer.

#### Write rules (event → memory)

| Event | Writes to | HITL? |
|---|---|---|
| User: “always do X” (global) | UserProfile item | No (explicit) |
| User: “always do X for study plans” | KindMemory item | No (explicit) |
| User accepts plan step / edits artifact durably | SubprojectMemory `decision` | No (action is consent) |
| User rejects / corrects agent | SubprojectMemory `decision` or supersede | No |
| System detects method across ≥2 subprojects of kind | KindMemory proposal `needsConfirm=true` | **Yes** — “Remember for all [kind]?” |
| System detects kind drift → fork clone | Target SubprojectMemory seed (relevant decisions only); **never** source KindMemory | Fork confirm already HITL |
| Session end / idle distill | Refresh SubprojectMemory.brief from session; proposals for kind if method-like | Brief auto-ok; kind promote **Yes** |
| User deletes memory in UI | `status=deleted` | N/A |

**Hard rules**

1. Never dump full transcript into Kind/Subproject memory.  
2. Never write Exam-session decisions into Quiz KindMemory.  
3. System-proposed method/preference stays `needsConfirm` until user accepts.  
4. Vault facts → update resource card (M5), not MemoryItem-as-syllabus-duplicate.

#### Read / prompt projection (feeds M8) — hybrid retrieval

**Two ways to use memory (both — not either/or):**

| Mode | When | What |
|---|---|---|
| **A. Inject into session context** | Every turn in a scoped session | Tiny **cards**: user prefs + kind playbook bullets + subproject decisions/open Qs |
| **B. Dynamic load on action** | When a tool/plan step needs a *similar* rule or past decision | Query MemoryItems (and optional embeddings) by kind/scope + intent; inject only hits into that step |

**Settled direction (stance):** Default is **A for a budgeted always-on pack** + **B for escalation**. Always-on keeps the agent “knowing them” without a tool round-trip; dynamic load keeps token use sane and pulls the *right* rule when writing a quiz vs planning an exam.

**A — Always-on pack (per subproject session turn)**

```
[User card]     ~150–300 tok  active prefs + top notes
[Kind card]     ~200–400 tok  KindMemory.brief + top N methods/rules
[Subproject]    ~300–600 tok  brief + recent decisions + open questions
[Resources]     cards from M5; chunks only if needed
```

Rebuild pack when session starts / after HITL accept on a lesson / after fork. Cap N (e.g. top 5 methods by recency×confidence). Rest stay in DB.

**B — Dynamic load (action-triggered)**

Triggers (examples):
- Planning step “draft quiz questions” → retrieve `kind=method|rule` where text/tags ≈ quiz, assessment, MCQ  
- User asks “what did we decide about the exam date?” → retrieve `type=decision` on this subproject  
- Tool `search_memory` (agent-callable) or harness pre-fetch before a recipe step  

```typescript
// Conceptual — harness before/during a step
const rules = await memory.query({
  userId,
  kindId,                    // current craft
  subprojectId,              // optional; omit for kind-wide methods
  types: ['method', 'rule', 'decision'],
  query: stepIntent,         // "write multiple choice quiz"
  limit: 5,
})
// Attach only `rules` to this step's prompt slice — not the whole history
```

**Routing rule of thumb**

| Memory type | Prefer |
|---|---|---|
| Stable prefs (tone, length, cite) | **A** always-on user card |
| Core craft methods (“always exit ticket”) | **A** kind card (top N) |
| Long tail of old methods/rules | **B** when action similar |
| Matter decisions / open questions | **A** subproject card (recent); **B** if asking about older ones |
| Lessons just accepted via HITL | Promote into A pack immediately |

**Anti-pattern:** Only B (agent forgets style until it searches). Only A with unbounded dump (token blowup + noise).  

**Mastra angle:** Always-on pack = system/context message on `generate`. Dynamic = `createTool({ id: 'recall-memory', ... })` and/or server-side prefetch in the recipe/run loop before the step. Prefer prefetch for known recipes; tool for open-ended chat.

**Stance:** Hybrid — inject a **small card pack** every turn; **dynamically recall** similar rules/decisions when the action or question needs them.


#### UI (memory surface)

- Settings / profile: User memory list (edit/delete).  
- Kind desk: “How you do [Study plan]” — methods list.  
- Subproject page: Decisions & open questions.  
- In-chat HITL chips: Remember? / Fork? / Attach?  
- Every system-written item shows source + evidence link back to session.

#### LLM turn output → lessons → memory (settled direction)

**Settled (user):** Every model turn returns structured output: a **message** (what the user sees) plus optional **lessons** (what we might remember). If a lesson is present, the runtime **creates a memory entry** (proposal or commit per rules below).

**Assumed shape (contract — field names can be bikeshed at build):**

```json
{
  "message": "…plain language reply / plan update / artifact narration…",
  "lessons": [
    {
      "text": "Prefers 45-minute lesson blocks",
      "kind": "preference | method | decision | rule | suggestion",
      "open_loop": "optional string — unresolved to park on memories.open_loops, not an item type",
      "scope_hint": "user | kind | subproject",
      "confidence": "high | medium | low",
      "why": "User said 'keep everything to one class period'"
    }
  ]
}
```

- `message` — required; rendered in the session UI.  
- `lessons` — optional array; omit or `[]` when nothing durable was learned.  
- One turn may yield **0–N** lessons (cap assumed: ~3 so the model doesn’t spam).

**Runtime pipeline**

```
LLM structured out
    │
    ├─► message → session transcript / UI
    │
    └─► each lesson
            │
            ├─ map kind + scope_hint → MemoryItem draft
            │     source = distilled (or explicit if user said "always…")
            │     evidence = this session + message id
            │
            ├─ if explicit user rule ("always…") OR decision from accepted action
            │     → write MemoryItem status=active (still visible/editable)
            │
            └─ else (inferred preference/method/suggestion)
                  → MemoryItem needsConfirm=true, status=pending
                  → HITL chip: "Remember this for [Study plan]?" [Yes] [No] [Edit]
                  → Yes → active on that scope; No → deleted/dismissed
```

**Scope routing (assume)**

| `scope_hint` | Lands on | When |
|---|---|---|
| `user` | UserProfile | Cross-craft style |
| `kind` | KindMemory | Craft method/rule for current kind |
| `subproject` | SubprojectMemory | Matter-specific decision / open Q |
| missing / wrong | Heuristic: decision→subproject, method/rule→kind, preference→user; if unsure → **subproject + needsConfirm** | |

**Lesson `kind` → MemoryItem.type**

| Lesson kind | Memory type | Notes |
|---|---|---|
| preference | preference | Tone, length, format |
| rule | rule | Must / never — highest A priority |
| method | method | Soft playbook for the craft |
| decision | decision | Matter-local choice |
| suggestion | method or decision | **Not stored as suggestion**; `needsConfirm=true` |
| (open_loop field) | → `memories.open_loops` | Not a MemoryItem |

**Hard rules**

1. Lessons never appear as the only channel for tools/plan — those stay harness fields if needed (`plan`, `tool_calls` separate from this memory channel).  
2. **No silent kind/user method writes** from inferred lessons — HITL.  
3. Cap + dedupe: if lesson text ≈ existing active item, skip or reinforce evidence, don’t clone spam.  
4. Forked sessions: lessons write to **current** kind/subproject only (exam clone ≠ quiz kind).  
5. User-facing: message stays clean; lessons surface as optional “Remember?” chips, not dumped into the chat bubble unless debugging.

**Prompting note:** System prompt tells the model: only emit lessons for durable, reusable signal; don’t lesson every turn; prefer empty `lessons` when unsure.

**Stance:** `message` + `lessons` is the **ingestion API from the LLM into M7**. Memory creation is automatic *drafting*; activation of inferred lessons stays human-in-the-loop.

#### Anti-patterns (reject)

- Single vector DB as the only memory.  
- Silent preference learning (**especially** from `lessons` without HITL).  
- Treating session transcript as durable project brain.  
- Merging kinds on fork.  
- Storing secrets (API keys) in memory items.  
- Putting tool calls or file paths inside `lessons` instead of harness channels.

#### Build notes for architect

- **TypeScript** package `@syraa/memory` — app/Mastra/SDK are TS. **Python only for ingest scripts.**  
- Postgres (or SQLite locally) for profiles, briefs, MemoryItems — primary.  
- Optional embedding index on MemoryItem.text for “find that decision.”  
- Projection layer versioned (prompt templates).  
- Soft delete + audit.  
- Per-user isolation on every query.  
- Structured output parsing (JSON schema / tool mode) for `{ message, lessons }` every turn.  
- Idempotent lesson→MemoryItem writer with dedupe.

**Stance:** Memory is a **small structured system with HITL promotion**, fed by per-turn **lessons**; not a chatbot history hack. Schema above is the brainstorm contract; column types/index engines finalize at build.

## Assumptions (memory)

- **Sessions attach to subprojects; kind holds method memory** — → assumed (stance)
- **Sibling subprojects share kind memory, not instance memory** — → assumed
- **Memory: user + vault + kind + subproject + session** — → assumed (refined)
- **M9 harness = thin Mastra** — settled (user). No Mastra Memory/RAG; plug Syraa SDKs only. AI SDK / LangGraph = escape hatches.
- **M7 Memory is a pluggable package wired into Mastra (not inside Mastra)** — settled (user).
- **Cross-kind fork when session outgrows craft** — clone session into target kind, redirect user, keep source quiz convo + Quiz kind memory. → settled (user)
- **Visible editable memory; no Neo4j in v1** — → assumed

## Decisions (memory)

- **M9 = thin Mastra** — settled (user 2026-08-29). Agents/tools/workflows; **no** Mastra Memory/RAG; wire M2/M3/M7/M8 via M10. Domain packages never import Mastra. AI SDK / LangGraph = escape hatches only.
- **LLM output: message + lessons → memory entries** — settled (user).
- **Inferred lessons activate only with HITL** — assumed (fits standing HITL rule).
- (pending user) Confirm: sessions primarily on subproject; kind = methods.

## Ideas (memory)

- **Kind/instance: Study plan → Biology** — why: method memory shared; subject decisions isolated. → settled (user)
- **Multi-session per subproject + kind + instance memory** — → settled (user)
- **Decision log → profile distill** — why: remembers methods without stuffing transcripts. → keep (user ask)
- **“Remember this?” on repeated methods** — why: trust + accuracy. → keep

