# Plan: Three-part system prompt composition

**Status:** draft — pick up later  
**Related (separate):** [`semantic-retrieve.md`](./semantic-retrieve.md) (adds `search_materials`; context section references it when shipped)  
**Not in scope:** Phase 04 retrieval implementation itself — this plan is about **how instructions are organized and assembled**.

---

## Problem

Today `SYRAA_BASE_INSTRUCTIONS` in `packages/harness/src/mastra/prompt.ts` is one blob that mixes:

| Concern | Examples currently interleaved |
|---|---|
| **Harness behavior** | Answer the current turn; no recaps; clean `message`; no tool/status footers |
| **Context / materials** | Working memory, `list_materials`, `read_materials_section`, when to quote docs |
| **Memory** | Active memory types, lessons / structured output rules, what not to remember |

That makes each area hard to evolve independently, confuses the model (memory rules sit next to tool rules), and duplicates lesson guidance in `structured-turn.ts`.

---

## Target shape

Split turn instructions into **three explicit sections**, assembled in a fixed order:

```
┌─────────────────────────────────────┐
│ 1. Harness guardrails               │  static — product behavior contract
├─────────────────────────────────────┤
│ 2. Context usage                    │  static + dynamic materials outline
├─────────────────────────────────────┤
│ 3. Memory usage                     │  static rules + dynamic memory pack
└─────────────────────────────────────┘
```

Each section is its **own module + string constant** (or small builder). `buildTurnInstructions()` concatenates them with clear markdown headers so models (and humans) can tell the layers apart.

---

## Section 1 — Harness guardrails

**Purpose:** What Syraa is, how every turn should behave, and hard output constraints — **without** teaching retrieval strategy or memory taxonomy.

**Include:**

- Identity: helpful assistant; answer **what the user just asked**
- Thread history: use for follow-ups / pronouns; ignore unrelated prior topics
- Visible message contract:
  - Normal chat reply only in `message`
  - No recaps, memory inventories, conversation summaries unless asked
  - No runtime footers (`Working memory updated`, `Lesson extracted`, tool logs, `_agentNote`, etc.)
  - End on the answer; weave tool results in prose, don’t narrate “I called a tool”
- Structured turn boundary (high level only): “A separate step extracts `{ message, lessons }`; your streamed reply should already satisfy the message rules above.” — **not** full lesson taxonomy here

**Exclude (moves to sections 2 & 3):**

- Materials tools and retrieval flows
- Memory types, when to recall, lesson emit rules
- Materials working memory description

**Guardrail metaphor:** product “constitution” — same for every user, every turn.

---

## Section 2 — Context usage

**Purpose:** How to use the **materials vault** (`@syraa/context`) — tools, layers, and escalation — without repeating harness output rules.

**Include:**

### Layers (brief)

| Layer | What the model sees | Use when |
|---|---|---|
| L1 outline | Doc names + top-level section titles (WM + `list_materials`) | User names a doc; orient before drill-down |
| Search hits | Snippets from `search_materials` (when shipped) | Cross-doc questions; “what do you know about X?”; unknown which file |
| L1 body | Section / leaf text via `read_materials_section` | Known doc + section; need quotes or full passage |

Dynamic block: **materials overview** (same as today’s `formatMaterialsOutline` output).

### Retrieval playbook (model decides — prompt only, no code gates)

1. **Cross-doc / entity / topic question** (“what do you know about madverse?”, “anything on chroma db?”)  
   → **`search_materials({ query })` first** across all ingested docs.  
   → Do **not** start by listing every PDF or reading random sections.

2. **Known document + section** (“open week 4 of the syllabus”, “read the intro of THE_BREAKUP”)  
   → Use outline / WM if doc name is already clear → **`read_materials_section`**.

3. **Need fresher catalog** (outline stale, doc missing from WM)  
   → **`list_materials`** once, then continue with search or read as appropriate.

4. **After a search hit — expand in the tree (your idea)**  
   When `search_materials` returns a chunk/topic hit:
   - Treat the hit as **evidence pointer**, not the full answer.
   - **Walk back up the topic tree** to the enclosing section (parent topic chain).
   - **Gather adjacent leaf chunks** under that section (sibling leaves + bridge overview for that subtree) via `read_materials_section` with the matched section title — or a future narrow `get_evidence(topicId)` tool if we add it.
   - Synthesize from that **local neighborhood**, not from one isolated snippet alone.

   Rationale: semantic match finds the needle; tree neighborhood supplies thread and surrounding context (definitions, caveats, lists).

5. **After any tool returns** — answer from that result; don’t repeat the same tool call with identical args in one turn.

6. **Quoting rule** — don’t assert document body unless a context tool returned it this turn.

**Exclude:**

- Lesson / product memory rules
- “Don’t append Working memory updated” (harness guardrails)

**Dependency:** `search_materials` tool + `context.searchMaterials` from [`semantic-retrieve.md`](./semantic-retrieve.md). Context section can ship with a “coming soon” stub or land in the same sprint after retrieval exists.

---

## Section 3 — Memory usage

**Purpose:** How to use **product memory** (`@syraa/memory`) and **Mastra thread working memory** — separate from materials vault.

**Include:**

### What memory is (and is not)

| Store | Holds | Not |
|---|---|---|
| **Product memory** (prefs, rules, methods, decisions) | How the user works; standing choices | Document text, chunk embeddings |
| **Thread working memory** | Materials L1 outline only | User profile, lesson payloads |
| **Thread messages** | Conversation | Durable memory (unless distilled to lessons → M7) |

Dynamic block: **current active memory** list (`[type] text` per item), same as today.

### When to use product memory

- **Always apply silently** when relevant: tone (preference), triggers (rule), workflow (method), past choice (decision)
- **Do not recite** unless user asks (“what do you remember?”)
- **Do not confuse with vault** — company facts in PDFs are context, not memory, unless user explicitly asked to remember them as a standing fact

### Lessons (structured output — lives here, not in harness section)

- Default `lessons: []`
- Emit only on durable self-knowledge: explicit “remember…”, standing pref/rule/method/decision
- Do **not** emit for research, recommendations, one-off tasks, inferred interests
- Type hints: rule / preference / method / decision; open loops → `open_loop`, not lesson body
- Align `structured-turn.ts` instructions with this section (single source — import shared bullet list or duplicate minimally with a comment pointing to `prompt/memory.ts`)

### Mastra working memory

- Updated by harness on thread create / ingest refresh — **not** by the model stuffing user facts into the materials template
- Model should **not** try to call `updateWorkingMemory` for user profile facts; those go through lessons → M7 (today’s madverse thread failure mode)

**Exclude:**

- Materials search / tree traversal
- Generic “answer the current turn” rules

---

## Code layout (proposed)

```
packages/harness/src/mastra/prompt/
  index.ts              # buildTurnInstructions export surface
  harness-guardrails.ts # HARNESS_GUARDRAILS
  context-usage.ts      # CONTEXT_USAGE + buildContextSection(outline)
  memory-usage.ts       # MEMORY_USAGE + buildMemorySection(items)
  format.ts             # formatMaterialsOutline (unchanged)
```

```ts
export function buildSystemPrompt(
  memoryItems: MemoryItem[],
  materialsOutline: string,
): string {
  return [
    "# Harness",
    HARNESS_GUARDRAILS,
    "",
    "# Context",
    buildContextSection(materialsOutline),
    "",
    "# Memory",
    buildMemorySection(memoryItems),
  ].join("\n");
}
```

**Also fix:** `syraa-agent.ts` currently uses bare `SYRAA_BASE_INSTRUCTIONS` without dynamic memory/materials blocks. Agent definition should either use a thin static subset or document that **per-turn** `instructions` from `buildTurnInstructions()` override at stream time (verify Mastra merge behavior; goal = one assembly path).

---

## Migration steps

1. Extract three strings from current `prompt.ts` without changing semantics (pure refactor + tests snapshotting section headers).
2. Move lesson bullets out of harness section into memory section; trim duplicate from `structured-turn.ts` where possible.
3. Rewrite context section with retrieval playbook (search → tree expand); keep existing tools until `search_materials` lands.
4. Add a small test: `buildSystemPrompt` output contains `# Harness`, `# Context`, `# Memory` in order; memory items and materials outline appear only in their sections.
5. Manual thread replay: madverse company question, chroma cross-doc question, “remember that…” lesson turn.

---

## Non-goals

- Multiple prompts per agent persona / profession (future)
- Code that **blocks** tools based on user phrasing
- Moving structured-output schema or `applyLessons` logic into prompt files
- Mastra Memory / RAG replacement

---

## Acceptance criteria

1. Prompt source is three modules; no monolithic `SYRAA_BASE_INSTRUCTIONS` blob.
2. A reader can change context retrieval guidance without touching memory or harness rules.
3. Context section documents: search first for cross-doc asks → expand hit via topic tree / adjacent leaves.
4. Memory section owns lessons + product memory; harness section owns message cleanliness and turn focus.
5. Dynamic data (materials outline, memory pack) inject only into sections 2 and 3.
