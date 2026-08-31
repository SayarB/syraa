# Brainstorm: Everyday harness (product + wiring)

Living notes for **product**, hierarchy, HITL, drive, Mastra wiring, and anything not owned by Memory or Context packages.

Sibling docs: [`memory.md`](./memory.md) · [`context.md`](./context.md)

**Split (2026-08-29):** Deep dives for Memory and Context were moved out of the monolithic brainstorm so we can take one package forward at a time.

**Repo:** `/Volumes/ssd/code/everyday` · plans in `plans/` · feasibility scripts in `scripts/`.

Working name: **Everyday** (product). **Harness** is architecture, not the thing users see.

## Problem framing

Agent tools that actually *do multi-step work* (Cursor, Codex, Claude Desktop/Code) are built for people who already think in files, terminals, tools, and prompts. **Professionals who are not software operators** — teachers, lawyers, writers, creators, researchers, consultants — feel the same pain: long messy work over documents and research, but bounce off setup, jargon, and a blank chat box.

Chatbots are easy to open and weak at finishing a body of work on *their* materials. The gap is: **an agent that works on their files, remembers crafts (kinds) and matters (subprojects), and leaves artifacts — without asking them to become operators.** Not an education-only product; education was an early example set.

## Context / constraints / severity (inferred)

- User named teachers, students, researchers → knowledge work in documents, not coding.
- They want opinionated + easy pickup + a UI.
- Severity: high for adoption, easy to lose by building a generic wrapper.
- Landscape (2026): Claude Cowork is “Claude Code for knowledge work” (folder + connectors + deliverables). MagicSchool / Khanmigo / CARL own teacher *generators*. Elicit / SciSpace / PaperGuru / Feynman own research *literature*. Empty middle: a simple **project + plan + receipts + artifact** loop that is not a developer IDE and not a 80-tool prompt gallery.

## Build packages (monoliths / subsystems)

Treat these as **separately ideatable, buildable, and pluggable** units.

**Settled (user):** Each major part is **separate software** (own package / bounded module) that **plugs into the Mastra harness** — Mastra orchestrates; it does **not** own memory DB, drive, ingest, or hierarchy internals. Domain packages must **not** import Mastra; Mastra adapters call their SDKs.

```
              ┌──────────────────────────┐
              │  Mastra harness (M9)     │
              │  Agent · tools · hooks   │
              └────────────┬─────────────┘
     ┌──────────┬──────────┼──────────┬──────────┐
     ▼          ▼          ▼          ▼          ▼
  Memory     Context    Drive     Hierarchy   Ingest
  (M7)       (store+    (M2)      (M6)        (M4)
             retrieve+
             assemble)
```

| # | Package | Owns | Needs deep planning | Depends on |
|---|---|---|---|---|
| **M1** | **Identity & tenancy** | Auth, `userId`, quotas | Low now | — |
| **M2** | **Drive (S3 FS)** | Per-user files, paths, tenancy wall | Path layout, quotas | M1 |
| **M4** | **Ingest** | Extract → card/chunk/embed → write into context store | Algorithm at build | M2, Context |
| **M5** | **Vault** | Resource entities / card typing over store | Card schemas | Context, M4 |
| **M6** | **Hierarchy** | Kinds / subprojects / sessions; HITL fork | State machine | M1, M2 |
| **M7** | **Memory** | `memories` + `memory_items`; pack + recall + lessons | Schema settled; SDK at build | M6 |
| **Context** | **`@everyday/context`** | Store catalog/chunks/cards; pluggable retrievers; assembleTurnPack | **Pluggable context storage + retrieval** | M2, M4, M7 (inject memory pack) |
| **M9** | **Harness (Mastra)** | Agent, tool adapters, turn hooks | Thin wiring | all SDKs |
| **M10** | **Tool adapters** | Mastra wrappers over Drive/Context/Memory | — | M2, Context, M7 |
| **M11** | **UI** | Chat, dashboard, HITL, memory viewer | Separate app | Package APIs |
| **M12** | **Connectors** | GSuite import/export | Optional plugin | M2 |
| **M13** | **Seed kinds / recipes** | Starter crafts | Config | M6, M9 |

**Plugin contract (every domain package):**

1. Own schema + migrations.  
2. Public TypeScript SDK (HTTP optional later).  
3. Zero imports from Mastra.  
4. Harness plugs via: **context load** · **tools** · **post-turn hooks** · **UI APIs**.  
5. In-process monorepo first; split hosts only when needed — “separate software” = **boundaries**, not forced microservices.

**M7 → Mastra plug points**

| Hook | When | SDK |
|---|---|---|
| Context **A** | before `generate` | `memory.getPack({ userId, kindId, subprojectId })` |
| Recall **B** | tool during generate | `memory.recall({ query, kindId, … })` |
| Lessons write | after `response.object` | `memory.ingestLessons({ …, lessons, evidence })` |
| HITL confirm | UI | `memory.confirmItem(id)` / `dismissItem(id)` |

Same pattern for Drive (FS tools), Search, Hierarchy (attach/fork HITL), Ingest (async worker, not in-agent).

**Suggested deep-dive order (when building):** M6+M7 SDKs → M2–M4 → M9 Mastra wiring → M11 UI → M12.

**Still light / assumed only:** onboarding polish, billing, admin, compliance verticals, Neo4j, MCP marketplace (cut).

---

## What will be implemented (v1) — refreshed summary

- Hosted **web app**; no BYOK, no laptop FS, no MCP marketplace.
- **Pluggable packages** into Mastra (memory, drive, hierarchy, … as separate SDKs).
- **Profession-agnostic** substrate: kinds × subprojects × sessions.
- **HITL** for create/attach/fork/clone/redirect/remember.
- **Per-user S3 drive** + catalog + content index; async ingest → resource cards.
- **Memory** at user / kind / subproject (+ session ephemeral).
- **Cross-kind fork:** clone session + redirect user; source kind+session preserved.
- **Tools:** web, search materials, drive FS; GSuite import/export optional phase.
- Seed kinds + recipes; kinds also emerge from use.

Out of v1: shell, local disk agent, school SSO/FERPA as GTM, Neo4j, tool marketplace, 3+ hierarchy levels.

---


- Onboarding — assumed
- Projects / binder (Works + Vault) — settled enough (multi-session projects)
- Sessions (global → project migrate) — settled (user)
- Recipes (job cards) — assumed
- Run loop (plan → do · receipts) — assumed
- Agent toolkit — settled-enough
- Artifacts — assumed (inside project / S3 drive)
- Resource vault / ingest — settled (contract); algorithm deferred to build
- Context pyramid — settled-enough
- **Working-style / project memory** — settled-enough (user)
- Trust / undo / sources — assumed
- Accounts / privacy — assumed
- Settings (hidden model) — assumed
- Connectors — GSuite import/export alongside S3 drive
- Plugin / skill marketplace — cut
- K-12 classroom student data — cut
- Laptop FS grants — cut (replaced by S3 virtual drive)

Coverage: `m8-context: brainstorm-complete-enough · m3-retrieval: brainstorm-complete-enough · m4-ingest: feasibility-algo · m7-memory: brainstorm-complete-enough · pluggable-packages: settled · profession-agnostic: settled · hitl-hierarchy: settled`

## Per-part notes

### Positioning (whole product)

- Settled (user, refined): **Not an edtech product.** Teachers/students/researchers were examples. Same system must extend to **any profession** that does knowledge work: lawyers, writers, influencers/creators, consultants, etc. — research, prep, drafting, planning.
- Settled: opinionated + easy pickup + UI for people who are not software operators.
- Assumed product framing: **Everyday = craft desks (kinds) × durable matters (subprojects) × sessions**, with vault, S3 drive, HITL hierarchy, cross-kind fork. Profession is a *lens on kinds*, not a separate app.
- Assumed v1: ship the **generic substrate** + a **small seed set of kinds** (not 40 verticals). New kinds emerge as users work (or from a light catalog later). Do not hardcode “teacher mode.”
- Pushback: “for everyone” in *marketing* without a first wedge in *distribution* stalls GTM — but the **data model must stay profession-agnostic** so lawyers aren’t bolted on later. → substrate universal; go-to-market can still pick a first beachhead.
- Override / cut: none on extensibility — user wants all professions.
- Architecture: hosted web app; kinds/subprojects/sessions; vault + S3 drive; HITL; fixed toolkit.

### Projects / binder

- Settled (user): **Project** = a *kind* of work (subject-agnostic): Study plan, Teaching plan, Lit review, Thesis writing — not “Study plan — Biology.”
- Settled (user, this turn): **Subproject** = concrete scope under that kind: Biology, CHEM 201, Bio 101 Fall, Chapter 2. Subject/instance nests under kind.
- Settled (user): A project (kind) contains many subprojects; each **subproject holds many chat sessions**. Shared context at both levels (see hierarchy).
- Settled (user): New chat starts **global**. Detect work → ensure kind Project + scope Subproject → **move session into the subproject** (usually).
- Settled (user): **Resource vault** feeds many subprojects; materials link primarily to the instance.
- Settled (user): Top-level projects **emerge as kinds of work**; subjects are not flat peer projects.
- Real-world anchors:
  - Practice area vs matters (law)
  - Service line vs client engagements (studio)
  - Cookbook section vs recipes
  - Department desk vs course sections
  - Slack: `#study-plans` channel vs threads per subject — weak; better: desk + case files
- Assumed **two-level model**:

  | Level | What | Examples | Owns |
  |---|---|---|---|
  | **Project** (kind) | How you do this type of work | Study plan, Teaching plan | Kind/method memory, defaults, desk UI |
  | **Subproject** (instance) | One concrete run on a scope | Biology, Chem midterm, Ch. 2 | Sessions, vault links, artifacts, instance decisions |

- Assumed **promote flow** (always HITL):
  1. Global: “make a study plan for biology”
  2. System **proposes**: Project Study plan + Subproject Biology
  3. User confirms → create/ensure both
  4. User confirms attach → session joins Biology
  5. Clear label: “You’re in Biology under Study plan”
  (No silent ensure/attach.)
- Assumed: session attaches to **subproject** by default; rare kind-only sessions for meta (“how should I structure study plans?”).
- Assumed: subproject label = any **scope** (subject, course, chapter, paper) — not only academic subject.
- Assumed: first study-plan ask creates Project+Subproject together; second subject reuses Project, new Subproject.
- Soft pushback: extra level can feel like a click tax — mitigate by deep-linking to subproject after promote.
- Soft pushback: confirm when matching existing subproject is fuzzy.
- Soft pushback: don’t dump all sibling subproject sessions into context — pack = user + kind memory + subproject brief/memory + cards.
- Settled (user): **Human-in-the-loop** for create/attach/fork/clone/redirect/remember — system proposes, user confirms.
- Parked v1: 3+ levels (kind → subject → unit); moving subprojects across kinds.
- Ideas kept: kind/instance hierarchy; subject-agnostic projects.

#### Hierarchy method (deep dive)

**Why not “Study plan — Biology” as the project**

Flat instance-as-project means Chemistry is a sibling with **no shared method memory**. You re-teach “how I make study plans” every subject. Kind/instance splits:
- **Project memory** = methods/defaults for study-plan work
- **Subproject memory** = Biology-only decisions (exam date, skip chapter)

**What each level stores**

| | Project (Study plan) | Subproject (Biology) |
|---|---|---|
| Sessions | Rare meta | Primary concrete work |
| Memory | Methods, templates prefs | Instance decisions, open questions |
| Brief | Playbook for this kind | Goal/status for this scope |
| Files | Optional shared templates | Syllabus, drafts, artifacts |
| Vault links | Weak | Strong |

**Context pack (subproject session):** User card + kind brief/memory + subproject brief/memory + linked cards → chunks on demand.

**Routing:** propose kind + subproject → **user confirms** → attach session. Fuzzy match → user picks. Never silent.

**S3 assumption:** `{userId}/projects/{kindSlug}/{subprojectSlug}/` + catalog fields `projectId`, `subprojectId`.

**Stance:** Hierarchy is right for Everyday. Flat “Study plan — Biology” optimizes hour one and punishes hour ten. People already speak kind then scope: *I make study plans* / *for biology*.

#### Subproject vs new session (split rule)

**Problem:** “Biology midterm study plan” vs “Biology final study plan” — new subproject, or new session under Biology?

**Core test (stance):**  
A **subproject** = one durable **scope identity** whose materials and decisions should stay co-located.  
A **session** = one **conversation episode** (or one focused push) inside that scope.

Ask: *If I open this container next month, should midterm and final decisions, files, and memory live in one pile or two?*

| Signal | Prefer **same subproject + new session** | Prefer **new subproject** |
|---|---|---|
| Same subject + same primary materials (one syllabus/course) | ✓ midterm then final | |
| Same kind, **different subject/course** | | ✓ Biology vs Chemistry |
| Same subject but **different material set** that shouldn’t mix | | ✓ Bio 101 vs Bio 201; Paper A vs Paper B |
| Time-boxed slice of same course (midterm / final / week 5 quiz) | ✓ (tag the session / goal) | only if user insists on hard split |
| “Continue what we did yesterday” | ✓ same session or new session, same sub | |
| User names a **new stable label** they will return to as its own home | | ✓ “Honors thesis Ch. 2” vs “Ch. 3” |
| Kind changes | | new **project** (kind), not just sub |

**Default rule I’ll assume:**

1. Match **kind** (Study plan).  
2. Match **subproject by durable scope** ≈ course/subject/paper — **not** by exam/milestone.  
3. Midterm / final / “add a quiz week” → **new session** (or continue session) under that subproject; write the milestone into **subproject brief + session goal**, not a new subproject.  
4. Only split a new subproject when scope identity differs (different course, different paper, different teaching section) **or** user explicitly says “make this a separate project/space.”  
5. When unsure → **confirm once**: “Continue under **Biology**, or start a separate space for the final?”

**Worked examples**

| User says | Kind | Subproject | Session |
|---|---|---|---|
| “Study plan for biology” (first time) | create Study plan | create Biology | this chat |
| “Study plan for biology midterm” (Biology exists) | Study plan | **Biology** | new (goal: midterm) |
| “Now do the final” | Study plan | **Biology** | new (goal: final); memory still has midterm decisions + shared syllabus |
| “Study plan for chemistry” | Study plan | create **Chemistry** | this chat |
| “Teaching plan for Bio 101” then “for Bio 102” | Teaching plan | Bio 101 vs **Bio 102** | separate subs — different courses |
| “Lit review for RAG” then “for agents” | Lit review | RAG vs **Agents** | separate — different paper scopes |
| “Update the biology study plan” | Study plan | Biology | continue or new session same sub |
| “How should I structure study plans in general?” | Study plan | *(none — kind-level or global)* | meta session on kind |

**Why not subproject-per-milestone**

- Midterm and final **share** syllabus, vault links, “skip plants,” pacing prefs. Splitting into `Biology-midterm` / `Biology-final` duplicates materials and breaks continuity.  
- Session goal + artifact names (`midterm-plan.md`, `final-plan.md`) already separate deliverables inside one scope.  
- Subproject explosion: every quiz becomes a folder; dashboard turns into noise.

**Escape hatch**

If someone wants isolation (“don’t mix final with midterm notes”), they can **Split** a subproject later (copy links, optional memory fork). Don’t default to that.

**Session vs continue**

- Same day / same thread of thought → stay in session.  
- “New chat” from Biology page → new session, same subproject memory/brief.  
- Don’t auto-merge two sessions; shared brain is subproject memory, not concatenated transcripts.

**Stance:** Scope-stable subprojects (Biology), milestone-flexible sessions (midterm/final). Confirm only on ambiguity. This keeps two-level hierarchy honest without a hidden third level called “midterm.”

#### Same method outside study plans

**Teaching plan (teacher)**

| | |
|---|---|
| **Kind (project)** | Teaching plan — how *you* plan units (outcomes first, 45-min blocks, always include exit ticket) |
| **Subproject** | One course/section: **Bio 101 Fall**, or **Grade 9 Photosynthesis unit** if that’s the durable home |
| **Sessions** | “Draft week 1–4”, “Make the midterm review lesson”, “Rewrite lab for rainy day” |

- “Teaching plan for Bio 101” then “for Chem 101” → two **subprojects** (different courses).  
- “Add a quiz for week 4” inside Bio 101 → **new session**, same subproject (same syllabus/vault).  
- Kind memory: “always align to learning outcomes.” Subproject memory: “this section is behind; skip field trip.”

**Lit review / reading brief (researcher)**

| | |
|---|---|
| **Kind** | Lit review (or Reading brief) |
| **Subproject** | One paper topic / claim cluster: **RAG survey**, **Agent memory** |
| **Sessions** | “First pass on these 8 PDFs”, “Tighten related-work section”, “Add 2025 papers” |

- New research *question* or *paper* → new subproject.  
- Another pass on the same RAG pile → new session.  
- Don’t make “round 2” its own subproject.

**Thesis writing**

| | |
|---|---|
| **Kind** | Thesis writing |
| **Subproject** | Durable chapter/part: **Ch. 2 Related work**, **Ch. 4 Methods** |
| **Sessions** | “Outline”, “Draft from notes”, “Advisor feedback pass” |

- Chapters are scope (like subjects). “Fix intro paragraph” is a session under Ch. 1, not a new subproject.  
- Whole-thesis meta (“how should I structure the dissertation?”) can sit on the **kind** or a subproject **Overview**.

**Student assignment coach** (if in scope later)

| | |
|---|---|
| **Kind** | Assignment help / Study support (careful: not homework-doer) |
| **Subproject** | Course: **CHEM 201** |
| **Sessions** | “Problem set 3 walkthrough”, “Exam review” — same course home |

**Pattern (all kinds):** kind = craft · subproject = durable object of that craft · session = one working bout. Profession-agnostic.

#### Profession extensibility (beyond teaching/learning)

**Claim:** The hierarchy is already a **general knowledge-work OS**. Education was illustrative. Same atoms serve any craft.

| Profession | Example kinds (projects) | Example subprojects (instances) | Example sessions |
|---|---|---|---|
| Teacher | Teaching plan, Quiz, Exam planning | Bio 101 Fall | Draft weeks 1–4; fork quiz→exam |
| Student | Study plan, Assignment coach | CHEM 201 | Midterm prep; final prep |
| Researcher | Lit review, Paper writing | RAG survey | First PDF pass; tighten related work |
| **Lawyer** | Case prep, Memo writing, Discovery review | *Smith v. Jones*; *Acme diligence* | Outline facts; draft memo; deposition prep |
| **Writer** | Book project, Article research, Outline | Novel MS; “AI regulation essay” | Chapter outline; interview notes synthesis |
| **Influencer / creator** | Content research, Script / series prep, Brand kit | “Q3 launch series”; Sponsored: BrandX | Hook research; script draft; competitor scan |
| Consultant | Proposal, Workshop design, Client research | Client Acme / Phase 2 | Stakeholder map; deck outline |
| Marketer | Campaign brief, Competitive research | Spring launch | Messaging options; channel plan |

**What stays universal (do not specialize the core):**

- Global chat → HITL promote to kind + subproject  
- Kind method memory vs instance memory  
- Scope-stable subproject / milestone sessions  
- Cross-kind fork (clone + redirect) — e.g. **Article research → Full essay draft**; **Content research → Script series**; **Memo → Full case prep**  
- Vault + S3 drive + catalog/content indexes  
- Fixed tools: web, search materials, drive FS, optional GSuite  

**What can specialize later (plugins of opinion, not new products):**

- Seed kind catalog / recipes per profession (“Case prep”, “Script series”)  
- Resource-card schemas (syllabus vs complaint vs shot list)  
- Compliance overlays (legal hold, creator brand safety) — later  

**Stance:** Extensible to all professions **if kinds stay user/ emergent and the substrate never says “classroom.”** v1 ships substrate + few starter kinds; vertical flavor is recipes and card types, not forks of the app.

**Risk:** Boiling the ocean on day-one copy (“for everyone!”) with no beachhead. Recommend: **universal product language** + pick one distribution wedge later (still not “edtech-only architecture”).


#### Cross-kind fork (session outgrows its kind)

**Problem:** Session starts under **Quiz** (e.g. Biology). It grows into full **examination planning**. Keeping the parent kind as Quiz is wrong. Deleting or renaming Quiz away would forget **how quizzes are built**. Need a fork across kinds without amnesia.

**Real-world twin:** A short memo engagement becomes a full litigation matter — you open a new matter file, keep the memo practice’s playbook, and link the memo as related work. You don’t relabel the whole memo desk “litigation.”

**Objects in a fork**

| Piece | What happens |
|---|---|
| **Source kind** (Quiz) | Stays. Kind memory untouched (“how we build quizzes”). |
| **Source subproject** (Biology under Quiz) | Stays as the quiz home; artifacts/sessions history remain findable. |
| **Target kind** (Examination planning) | Create if missing — new craft desk. |
| **Target subproject** | Match/create same durable scope when it still fits (Biology), else new scope. |
| **Session** | **Clone** into target subproject (copy thread + handoff state). **Source session stays** under Quiz. **UI moves the user** to the clone (they continue in Exam planning). Not a move/delete of the quiz convo. |
| **Link** | Bidirectional **related**: Quiz/Biology ↔ Exam planning/Biology; also **forked-from / forked-to** between the two sessions. |
| **Files** | Stay on S3; catalog may add target `projectId`/`subprojectId` or keep paths and add cross-links. Don’t duplicate blobs. New exam artifacts write under the target subproject path. |

**When to fork (detection signals)** — any strong signal → **propose to the user**, never silent fork/clone/redirect:

- User language shifts: “full exam”, “exam blueprint”, “whole assessment plan”, not “one quiz.”
- Deliverable shape changes: multi-section exam, grading rubric, schedule, accommodations — beyond a single quiz artifact.
- Plan length/scope blows past quiz recipe defaults.
- User explicitly: “this should be exam planning” / “promote this.”

**Human-in-the-loop (standing rule for hierarchy)**

Every structural change is **detect → explain → confirm → act**:

| Event | System does | User must |
|---|---|---|
| Global chat looks like a job | Propose kind + subproject | Confirm create/attach |
| Scope match fuzzy | Offer candidates | Pick continue vs new space |
| Kind drift (quiz → exam) | Offer fork + clone | Confirm Fork or Stay |
| After fork | Show where clone will live | Confirm before redirect |
| Method promotion | “Remember for all study plans?” | Accept / decline |
| Delete / split subproject | Warn | Confirm |

No silent: create kind, create subproject, move/clone session, redirect, or write kind memory. Agent may prepare a preview card; nothing commits until the user says yes.

**When NOT to fork**

- “Make a harder quiz” / “add 5 more questions” → same kind, same subproject, same or new session.
- “Quiz for Chemistry” → new **subproject** under Quiz, not a new kind.
- Ambiguous → confirm: “Continue as Quiz, or fork into Examination planning?”

**Memory rules (critical)**

| Memory | Fork behavior |
|---|---|
| Quiz **kind** memory | **Never rewrite** from an exam-planning session. How quizzes are built stays pure. |
| Exam planning **kind** memory | Starts empty or lightly seeded from *exam-shaped* decisions in this session only (not the whole quiz playbook). |
| Subproject instance memory | **Copy relevant decisions** into target subproject brief (exam date, topics in scope); leave quiz-specific decisions on source. |
| User profile | Unchanged unless user says “always…” |
| Optional | After fork, if patterns look like exam methodology, ask “Remember this for Examination planning?” — never auto-merge into Quiz. |

**Flow**

1. Session under Quiz / Biology; agent/UI detects kind drift.  
2. Banner / card: “This looks like **Examination planning**. Fork? We’ll **clone** this chat under Examination planning → Biology, leave this quiz chat here, and switch you to the clone.” [Fork] [Stay as quiz]  
3. **Only after confirm:** ensure kind + subproject → clone session → related links → seed target brief → navigate to clone.  
4. Quiz convo remains under Quiz / Biology. User is now in the Exam planning clone.

**Variants**

- **Clone + redirect (default, user):** preserve quiz session; continue in exam clone.  
- **Empty spawn + summary only:** lighter copy if full clone is too heavy — optional later; v1 can clone messages + attach handoff card.  
- **Move session:** rejected for this product — user does not want the quiz convo relocated.

**Stance:** Fork = new kind desk + linked subproject + **session clone** + **user redirected to clone**; source kind memory and source session are sacred. Kind drift is not a rename and not a move.

**Out of v1 depth (note for later):** multi-hop forks; live sync between clone and source after fork. v1 = propose fork + clone session + redirect user + related links + memory isolation.


### Resource vault / ingest & context pyramid

→ Moved to [`context.md`](./context.md).

### Working-style memory (M7)

→ Moved to [`memory.md`](./memory.md).

### Context store + retrieval

→ Moved to [`context.md`](./context.md).

### Drive index (find files from anywhere)

- Settled (user): Index is a first-class part of the filesystem, not an afterthought. Traversal/search must resolve the right file without listing the whole bucket.
- Assumed **two indexes** (different jobs — don’t collapse into one):

  | Index | Answers | Built when |
  |---|---|---|
  | **Catalog** (structured) | “Where is Bio101 syllabus.pdf?” / list by folder, type, work, date | on every create/move/delete/rename |
  | **Content** (search) | “Which file talks about week 4 labs?” | async ingest (embed + lexical — algorithm at build) |

  → because “find from anywhere” is both *path/name* discovery and *what’s inside*. One embedding store alone fails exact filename lookup; catalog alone fails semantic asks. (brainstormer)

- Assumed **catalog record** per object (algorithm-agnostic): `userId`, `s3Key`, `path`, `name`, `ext/mime`, `size`, `updatedAt`, `workId?`, `resourceId?`, `tags[]`, `status` (processing/ready). Queryable by prefix, name (fuzzy), type, work.
- Assumed: UI “My files” browse uses catalog (fast tree), not live `ListObjects` as source of truth. S3 remains blob store; catalog is the map.
- Assumed: agent `find_file` / “search my files” hits catalog first; `search_context` hits content index; then `read` by key.
- Assumed: **write path updates catalog synchronously** (file exists in the map immediately); content index updates asynchronously (same ingest pipeline as before).
- Soft pushback: “traverse” should mean **query the index**, not recursive walk of S3. Walking is fallback/repair only (reconcile job).
- Out of brainstorm: Postgres vs OpenSearch vs Typesense for catalog; embedding model; hybrid rank — architect at build.
- Notes for architect: index consistency on rename/move/delete; per-user isolation in every query; repair job if catalog drifts from S3.

- Assumed agent FS tools on that prefix: `list`, `read`, `write`, `mkdir`, **`find`/`search files`**; `move`/`delete` with confirm on delete — all catalog-aware.
- Assumed UX name: **“My files”** / Everyday Drive — never “bucket” or “S3.”
- Soft pushback: GSuite = import/export; Everyday Drive = system of record while working here — don’t force two homes.
- Soft pushback: seed a simple default tree so recipes don’t dump chaos at the root.
- Risk for architect: quotas, large PDFs, lifecycle; catalog/content index cost.
- Assumed **not in toolkit** (v1): shell, code exec, browser automation, email send, arbitrary HTTP, MCP install.
- Assumed tool results → plain-language receipts + source chips.
- Notes for architect: fixed tool registry; S3 prefix isolation enforced in tool layer; GSuite least-privilege scopes when shipped.

## Competitive try-list — harness frameworks (like Mastra / AI SDK)

Not end-user apps — **TS agent runtimes** to dogfood for M9.

| Framework | Layer | Try for | Install / start |
|---|---|---|---|
| **Vercel AI SDK** | Model + tools + streaming UI | Thin harness; `generateObject` for `{message,lessons}`; `useChat` | `npm i ai` · https://sdk.vercel.ai |
| **Mastra** | Full agent framework | Agents, workflows, studio, HITL suspend | `npm create mastra@latest` · https://mastra.ai |
| **LangGraph.js** | Durable state graphs | Fork/HITL checkpoints, resumable runs | `@langchain/langgraph` · https://langchain-ai.github.io/langgraphjs |
| **OpenAI Agents SDK** | Agent + handoffs | Multi-agent handoff patterns (OpenAI-leaning) | `@openai/agents` |
| **Claude Agent SDK** | Claude-native harness | Anthropic agent loop / computer-use style | Anthropic agent SDK docs |
| **VoltAgent** | Agents + observability | Visual debug of tool paths | VoltAgent npm / docs |
| **Inngest AgentKit** | Event-driven durable agents | Ingest + long jobs beside chat | https://www.inngest.com |
| **Google ADK (TS)** | GCP-oriented agents | Only if you’re Google-cloud native | Google ADK |
| **Ax / BAML** | Structured output specialists | If `{message,lessons}` schema pain dominates | Ax, BAML docs |

**Skip / caution:** LlamaIndex.TS (archived Apr 2026 per recent roundups); CrewAI (Python-first); AutoGen for new greenfield.

**Settled (user 2026-08-29): M9 harness = Mastra (thin).** Agents, tools, workflows, HITL suspend — wire `@everyday/*` SDKs only. Domain packages stay Mastra-free.

**Thin Mastra rules (non-negotiable):**
1. **Do not use** Mastra Memory, Mastra RAG/vector, or Mastra-owned long-term store for product memory/context.
2. Plug **M7** (`getPack` / `recall` / `ingestLessons`), **M8** (`buildTurnPack`), **M2/M3** tools via **M10 adapters**.
3. Prefer product UI HITL; use Mastra suspend only when it simplifies pause/resume for structural confirms.
4. AI SDK / LangGraph remain **escape hatches** only if Mastra fights the package model — SDKs stay portable.

**Need from harness:** thin orchestrator; plug M2/M3/M7/M8 SDKs as tools + context + post-turn hooks; structured `{ message, lessons }`; optional multi-step tools; HITL outside the model; not a coding IDE.

| Option | Fit | Notes (pre-decision) |
|---|---|---|
| **Mastra** | **Chosen** | Agent/workflow DX; commit to BYO M7/M3/M8 |
| **Vercel AI SDK** | Runner-up | Thinner; revisit if Mastra overhead hurts |
| **LangGraph.js** | Parked | Durable graphs if interrupt/HITL pain appears |
| **Custom loop on AI SDK** | Parked | Max control fallback |
| **LlamaIndex.TS / provider agents** | Rejected as primary | Fight or lock-in |

**Compared briefly (decision record):** AI SDK = thinnest BYO; LangGraph = durable HITL graphs; thin Mastra = harness ergonomics + BYO packages with discipline. User picked Mastra for agents/workflows/studio while keeping packages as source of truth.

## Architecture (whole)

Hosted web app with durable objects:

1. **Per-user S3 drive** — browsable “My files”; all uploads + agent outputs.
2. **Resource vault** — metadata + cards + index over drive objects.
3. **Projects (kinds)** — Study plan, Teaching plan, … — method memory + desk.
4. **Subprojects (instances)** — Biology under Study plan — sessions, artifacts, instance memory.
5. **Sessions** — start global; on detect, move into **subproject**; many sessions per subproject.
6. **User memory** — profile across everything.

**Context assembly (subproject session):** User card + kind memory/brief + subproject brief/memory + linked resource cards → chunks on demand.

**Lifecycle:** Global chat → ensure kind Project + scope Subproject → attach session to subproject → accumulate kind + instance memory.

Entry: global chat or dashboard (kinds → subprojects → sessions).

**Fixed toolkit:** web · search materials · S3 read/write/list/find · optional GSuite. No laptop FS. No MCP marketplace.

**Storage:** `{userId}/projects/{kind}/{subproject}/`; catalog + content indexes; `projectId` + `subprojectId` on records.

## Assumptions (harness / product)

- **Web app, hosted, no BYOK** — easy pickup. → assumed
- **Graduate / independent wedge first; K-12 not v1 GTM** — → assumed
- **Fixed toolkit, not marketplace** — → assumed
- **Projects = kinds (subject-agnostic); subprojects = instances** — → settled (user)
- **Global → ensure kind + subproject → migrate session** — → settled (user)
- **Dashboard: kinds → subprojects → sessions** — → assumed
- **Vault links mainly to subprojects** — → assumed
- **Confirm fuzzy subproject match; banner on promote** — → assumed
- **Per-user S3 drive + catalog/content indexes; algo at build** — → settled (user)
- **Two levels only in v1** — → assumed
- **Subproject = durable scope; milestones = sessions under it** — midterm/final stay in Biology unless user splits. → assumed (you said fine)
- **Product is profession-agnostic; kinds are crafts any field can grow** — lawyers, writers, influencers, etc. Education was examples only. → settled (user)
- **v1 = universal substrate + small seed kinds; not 40 vertical apps** — → assumed
- **Default turn = cheap pack; retrieval only on escalate triggers** — assumed.
- **Never move session or rename kind on drift** — → settled (user)
- **Fuzzy scope → one confirm** — continue under Biology vs separate space. → assumed
- **Fuzzy kind drift → one confirm** — stay as Quiz vs fork to Exam planning. → assumed
- **No laptop FS; GSuite import/export complements drive** — → settled / assumed


Package-specific assumptions live in [`memory.md`](./memory.md) and [`context.md`](./context.md).

## Decisions (harness / product)

- **Profession-agnostic product (not edtech-only)** — settled (user).
- **Kind / subproject hierarchy** — settled (user).
- **Human-in-the-loop for hierarchy** — settled (user).
- **Cross-kind fork: clone + redirect** — settled (user).
- **S3 drive + indexes** — settled (user).
- (pending user) GSuite v1 vs v1.1.
- (pending user) Promote UX loudness; two-level cap for v1.


Package-specific decisions live in [`memory.md`](./memory.md) and [`context.md`](./context.md).

## Ideas surfaced (harness / product)

- **Chat → Work factory** — why: matches how non-coders start. → keep (user)
- **Scope-stable subprojects; milestone sessions** — why: midterm/final share syllabus; avoid subproject explosion. → assumed (you said fine)
- **Profession-agnostic substrate (law, writing, creators, …)** — kinds/subprojects/sessions generalize. → settled (user)
- **Seed kinds + emergent kinds** — why: don’t ship edtech-branded core. → keep
- **Cross-kind fork (Quiz → Exam planning)** — clone session + redirect user; quiz convo stays. → settled (user)
- **Related + forked-from/to session links** — why: navigate both ways. → keep
- **Global session migrates into subproject** — why: don’t force create-project before thinking. → settled (user)
- **Resource vault shared across subprojects** — → keep (user)
- **Deep-link to subproject after promote** — why: hierarchy without click tax. → keep
- **Emerging work categories** — refined: categories *are* the kind-level projects. → keep (user)
- **Per-user S3 drive as My files** — why: real FS for the agent without laptop grants; user can browse everything. → settled (user)
- **Catalog + content indexes for find-from-anywhere** — why: name/path vs meaning are different queries. → settled (user); algo at build
- **GSuite as import/export only** — why: one system of record (S3 drive). → keep
- **Seeded folder tree under the drive** — why: avoid root-level dump. → keep
- **Recipe cards on empty dashboard** — why: first session before any Work exists. → keep for v1
- **Editable plan-as-checklist before run** — why: trust. → keep for v1
- **Confirm-on-resume when match is fuzzy** — why: wrong project attach is catastrophic. → keep
- **Local laptop FS grants** — rejected for v1 (replaced by S3 drive)
- **Rely on S3 ListObjects as search** — rejected
- **Local-first / private papers never leave the machine** — parked
- **School-safe mode (no student names)** — parked
- **Neo4j / full knowledge graph in v1** — rejected for v1
- **Summary-only, never retrieve source text** — rejected
- **Shell / code exec / MCP marketplace** — rejected

## Risks / open concerns

- **Cowork / ChatGPT agent mode eat the generic harness.** If Everyday is “easier Cowork,” it dies when Anthropic/OpenAI simplify onboarding. Survival is opinionated recipes + binder, not a prettier loop.
- **Three audiences is three sales motions.** Teachers (schools), students (cheating + cheap), researchers (citations + PDFs). Shipping all three as first-class is how the product stays vague.
- **Homework-doer gravity.** Students will try to make it do the assignment. Needs a stance (study coach vs ghostwriter) or the product gets a reputation.
- **Trust of sources.** Researchers will bounce on hallucinated citations harder than teachers bounce on a mediocre lesson draft.

## Recommended next step

- Stay in brainstorm until the wedge (who v1 is *for*) is accepted or overridden.
- Then: CPO / PRD pass is worth it — this is a product, not a small feature.

## Notes for CPO / architect

- Do not design an MCP/skill platform in v1.
- Success metric is “finished artifact they used,” not “messages sent.”
- Copy must never say harness, token, context, model, tool, agent loop.
- Closest competitors to study: Claude Cowork (loop), MagicSchool (teacher recipes), Elicit (research receipts). Everyday should feel like the overlap: Cowork’s loop, MagicSchool’s cards, Elicit’s sources — minus setup.
