# Jev eval: lesson gate

## Overall (read this first)

| Round | Cases | What it tested | Result |
|---|---|---|---|
| 1 | 37 | Explicit asks, marker traps, research, temporary, referential, noisy | 37/37 after one threshold change (tuned on this set) |
| 2 | 26 | Buried asides, rules inferred from complaints, long personal controls | 63/63 with a second question added (rule designed on rounds 1–2) |
| **3** | **100** | **Held-out: 12 categories × 3 difficulties; rule and questions frozen before running** | **95/100 acceptable, 92/100 exact, 0/14 wrong auto-activations** |
| 4 | 20 | Held-out: long (150–300 word) messages with one buried aside or inferred rule, plus long controls | 20/20 acceptable; buried line found #1 in 11/12 |

**Bottom line:** on cases it had never been tuned on, Jev + the frozen rule got 95% right, never auto-activated something it shouldn't have, and every error was a borderline "is this lasting?" call in the 0.4–0.7 band — not a confident mistake. Good enough to build the lesson gate on; thresholds still need real Syraa data.

---


# Round 1: 37 cases

Run on 2026-09-21 against `jev-latest` (served as `jev-1.13.0`), via `POST https://api.typesafe.ai/v1/systemone`.
Harness: `.plans/jev-system-one/eval/`. Rerun with `bun run.ts`; `AUTO` and `PENDING` env vars set the thresholds.

## Verdict

**Jev handles the keep-or-drop decision well enough to take up for the lesson gate.** It cleanly separates "the user is teaching something durable" from everything else. That includes every trap that fools today's regex.
Two of its outputs are useful on top of that (explicitness and self-contained). One is not: **`kind` is not reliable**, and should not drive auto-activation.

| Signal | Result on 37 hard cases |
|---|---|
| **Keep vs drop** (`durable` noul) | **37/37.** Every non-durable case scored ≤ 0.26; every durable case scored ≥ 0.55. Any threshold from 0.3 to 0.5 separates them. |
| **Three bands** (auto / pending / drop) | 34/37 at the planned auto threshold of 0.85; **37/37 at 0.65**. All 3 misses at 0.85 were explicit rules landing as *pending* instead of *auto*, so they erred on the safe side. |
| **Explicitness** (choice) | Every explicit durable case was labeled `explicit`, and every implicit one was not. The one non-durable case labeled `explicit` (H4) was already dropped on p = 0.23. |
| **Self-contained** (noul) | 16/17 at threshold 0.85. The only miss (B3) goes the safe way: it would trigger the lesson-writing LLM call when the user's words alone would have been fine. |
| **Kind** (choice) | **12/19.** Jev labels almost anything containing always/never as `rule`, including "never recommend thrillers" and "always reply in Hindi". |
| **Sentence-level span picking** | Clean on mixed messages: "Remember I'm vegetarian" scored 0.95 and "find me dinner tonight" 0.02. In J4 the buried "going forward always give me costs in INR" scored 0.96, and the task part 0.04. |
| **Determinism** | Two identical calls differ by at most 0.03. |
| **Latency** | p50 264 ms, max 676 ms (the first, cold call). 4 questions ≈ 800 input tokens. It runs in parallel with the stream, so the user never waits on it. |

## What today's regex gets wrong on the same cases

(This is the regex step only. Today it filters lessons the structurer LLM already emitted. So "regex would auto-activate" means *if* the structurer produced a lesson, nothing would stop it.)

- **It would auto-activate lessons on 9 non-durable turns:** C1–C6, H4, I1, I2. The trigger is a word like "always", "never" or "remember" inside a question, a poem, a code comment, or a sentence about a third party. Jev scored all 9 at ≤ 0.26.
- **It passes 12 durable turns to the LLM with no signal:** A4, B1–B5, E1, E3, E4, F1, J1, J2. Those include "pls dnt use emojis evr again", "haan, hamesha" and "yes please" to a going-forward offer. Jev scored all 12 at ≥ 0.55.

## Findings that change the design

1. **Auto-activate threshold is 0.65, not 0.85,** and only when explicitness = `explicit`. The explicitness check is what makes the lower number safe. Pending threshold: 0.5 (anything from 0.3 to 0.5 also works on this set).
2. **Stop using `kind === "rule"` to auto-activate** (today's `shouldAutoActivate`). Jev overcalls `rule`, so that path would auto-activate the wrong items. Auto-activation should come from explicitness. Kind is only a storage label, so being wrong about it costs little.
3. **Gate the whole turn first, then score sentences to pick the span.** Scored alone, "I'm really into Japanese woodworking lately" gets 0.57, which would become a pending card. The whole turn (D3) scores 0.16. Sentence scores should only choose *which text to store* once the turn has passed.
4. **Referential confirmations work.** "yes please", "haan, hamesha" and "do that for every repo of mine" all scored 0.72–0.88 with self-contained ≤ 0.25. So the "write lesson text only on a yes" LLM path is needed, and it fires only when it should.

## Caveats

- **37 cases, written by us, with thresholds tuned on the same set.** 0.65 is the best fit for these cases, not a proven number. Real Syraa turns are the next check.
- Only single turns plus one previous assistant message. No multi-turn inferred preferences.
- Mostly English, with some Hinglish. There's no test for scripts other than Latin.
- Criteria wording matters. The questions used here are in `eval/run.ts`, and they are what we'd ship. Changing them means rerunning.
- The regex column shows what the regex would allow, not what Syraa does end-to-end today. Syraa also depends on what the structurer emits.

## Next checks before building

1. Export past pending items that users approved or dismissed (`ItemStatus` `active` / `dismissed`), with the user turn that produced each. Run them through `run.ts`, and set the thresholds from that data instead of this set.
2. Rerun with `kind` criteria reworded to make "rule" rarer, or drop `kind` from the auto-activation decision entirely (recommended).

## All cases

Bands use explicitness = `explicit` for auto, and pending ≥ 0.5. ✗ = outside the expected set.

| ID | Group | Prev assistant | User message | Expected | p(durable) | Explicitness | Kind (Jev / exp.) | Self-contained p | Band @0.85 | Band @0.65 | Regex today |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A1 | explicit | — | From now on, answer in bullet points. | auto | 0.81 | explicit | rule / preference | 0.93 | pending ✗ | auto | auto |
| A2 | explicit | — | Remember that I'm vegetarian. | auto | 0.96 | explicit | preference / preference | 0.95 | auto | auto | auto |
| A3 | explicit | — | Never use emojis in your replies to me. | auto | 0.77 | explicit | rule / rule | 0.95 | pending ✗ | auto | auto |
| A4 | explicit | — | When I say 'tldr', give me exactly 3 bullets and nothing else. | auto | 0.68 | explicit | rule / rule | 0.90 | pending ✗ | auto | llm-decides |
| B1 | implicit | — | I prefer dark mode screenshots in any docs you draft. | pending/auto | 0.82 | implicit | preference / preference | 0.93 | pending | pending | llm-decides |
| B2 | implicit | — | fyi I'm on a Mac, so skip the Windows instructions. | pending/auto | 0.60 | implicit | rule / preference | 0.82 | pending | pending | llm-decides |
| B3 | implicit | — | I really can't stand long intros. Get to the point. | pending/auto | 0.55 | implicit | preference / preference | 0.80 | pending | pending | llm-decides |
| B4 | implicit | — | We decided to go with Postgres over Mongo for Syraa's storage. | pending/auto | 0.85 | implicit | decision / decision | 0.90 | pending | pending | llm-decides |
| B5 | implicit | — | When we debug together, check the logs first before proposing code changes. | pending/auto | 0.78 | implicit | method / method | 0.94 | pending | pending | llm-decides |
| C1 | marker-trap | — | Which airline always has the cheapest Delhi–Goa flights? | drop | 0.02 | none | none / none | 0.63 | drop | drop | auto |
| C2 | marker-trap | — | Find me laptops under 80k that never overheat. | drop | 0.04 | implicit | none / none | 0.71 | drop | drop | auto |
| C3 | marker-trap | — | Remember that movie with the spinning top at the end? What was it called? | drop | 0.04 | none | none / none | 0.37 | drop | drop | auto |
| C4 | marker-trap | — | Write a short poem that starts with 'From now on I will always love you'. | drop | 0.02 | none | none / none | 0.16 | drop | drop | auto |
| C5 | marker-trap | — | What does 'from now on' mean legally in a contract clause? | drop | 0.01 | none | none / none | 0.55 | drop | drop | auto |
| C6 | marker-trap | — | Fix this bug: ` // always validate input function add(a, b) { return a - b } ` | drop | 0.05 | implicit | rule / none | 0.18 | drop | drop | auto |
| D1 | research | — | Compare the best EVs under 20 lakh for city driving. | drop | 0.02 | none | none / none | 0.74 | drop | drop | drop |
| D2 | research | — | Help me pick running shoes for flat feet. | drop | 0.07 | implicit | none / none | 0.83 | drop | drop | drop |
| D3 | research | — | I'm really into Japanese woodworking lately — what are good beginner chisels? | drop/pending | 0.16 | implicit | none / none | 0.67 | drop | drop | llm-decides |
| E1 | referential | Want me to keep answers under 100 words going forward? | yes please | auto/pending | 0.79 | explicit | preference / preference | 0.17 | pending | auto | llm-decides |
| E2 | referential | Should I format this comparison as a table? | yes | drop | 0.08 | none | preference / none | 0.07 | drop | drop | llm-decides |
| E3 | referential | Here's the summary in Hindi as you asked. Should I keep replying in Hindi? | haan, hamesha | auto/pending | 0.88 | explicit | preference / preference | 0.25 | auto | auto | llm-decides |
| E4 | referential | I wrote the tests with Jest. Want me to switch to Vitest? | yeah, and do that for every repo of mine | auto/pending | 0.73 | explicit | decision / preference | 0.17 | pending | auto | llm-decides |
| F1 | mixed | — | Remember I'm vegetarian — also find me a place for dinner tonight in Indiranagar. | auto/pending | 0.91 | explicit | preference / preference | 0.12 | auto | auto | llm-decides |
| F2 | mixed | — | Book-wise I'm done with thrillers, never recommend them again. Anyway, what's the capital of Peru? | auto/pending | 0.86 | explicit | rule / preference | 0.08 | auto | auto | auto |
| G1 | temporary | — | For this conversation only, reply in Spanish. | drop | 0.02 | implicit | rule / none | 0.67 | drop | drop | llm-decides |
| G2 | temporary | — | Today I'm working from Pune, so use IST for the meeting times. | drop | 0.13 | implicit | rule / none | 0.73 | drop | drop | llm-decides |
| G3 | temporary | — | Just this once, give me the long version. | drop | 0.03 | none | preference / none | 0.08 | drop | drop | llm-decides |
| H1 | meta | — | Forget what I said about bullet points. | drop | 0.22 | none | rule / none | 0.18 | drop | drop | llm-decides |
| H2 | meta | — | Don't remember this, but I'm really stressed today. | drop | 0.06 | implicit | none / none | 0.55 | drop | drop | llm-decides |
| H3 | meta | — | What do you remember about me? | drop | 0.02 | none | none / none | 0.19 | drop | drop | llm-decides |
| H4 | meta | — | If I told you 'always use tabs', would you actually remember it? | drop | 0.23 | explicit | rule / none | 0.41 | drop | drop | auto |
| I1 | third-party | — | My boss always wants reports as PDFs, can you convert this one? | pending/drop | 0.26 | implicit | preference / preference | 0.18 | drop | drop | auto |
| I2 | third-party | — | My friend never eats pork. Suggest a menu for her birthday dinner. | drop | 0.20 | implicit | preference / none | 0.54 | drop | drop | auto |
| J1 | noisy | — | pls dnt use emojis evr again | auto/pending | 0.85 | explicit | rule / rule | 0.92 | auto | auto | llm-decides |
| J2 | noisy | — | yaar hamesha hindi me reply karna | auto/pending | 0.85 | explicit | rule / preference | 0.90 | auto | auto | llm-decides |
| J3 | noisy | (a 1,800-word answer) | oh great, another essay. love that for me. | pending/drop | 0.21 | none | none / preference | 0.09 | drop | drop | llm-decides |
| J4 | noisy | — | ok so I need to plan the offsite for 40 people in Nov, budget is around 6L, somewhere 3-4h from Bangalore, and btw going forward always give me costs in INR not USD, and make sure there's a vegetarian-friendly venue option. | auto/pending | 0.95 | explicit | rule / preference | 0.64 | auto | auto | auto |

---

# Round 2: buried asides and rules inferred from complaints

26 new cases, run on 2026-09-21 (`eval/cases2.ts`, `eval/run2.ts`, `eval/reveals-v2.ts`).
- **18 positives.** 12 are longer requests where a lasting fact or preference appears only in passing, with no memory words ("beaches just aren't my thing", "I read everything on my phone", "I'm colour-blind"). 6 are rules that have to be inferred from friction ("had to strip out all the emojis again", "third time I've scrolled past a history lesson", "don't do that without asking me").
- **8 controls.** Long, personal-sounding messages with nothing lasting in them: a delayed flight, a visiting sister, being tired this week, a character in a book, deck style for one client, a quoted customer email that says "always… never… remember this".

## Verdict

**Jev can pick up implicit asides and inferred rules, but only if we ask the right question.** The round-1 question ("is the user *teaching* you something?") is too strict for this, by design.

| | Round-1 "strict" question | "Reveals" v1 | **"Reveals" v2** (adds team decisions) |
|---|---|---|---|
| Asides + inferred rules scored ≥ 0.5 | **2/18** | 17/18 | **18/18** |
| Controls scored < 0.5 | 7/8 (N7 quoted email → 0.78 *explicit*) | 8/8 | **8/8** |
| Team decisions (B4 Postgres, S6 Bun) | B4 0.85, S6 0.06 | 0.21, 0.19 ✗ | **0.82, 0.86** |

**Combined rule across all 63 cases (round 1 + round 2): 63/63.** One Jev call asks three questions (`strict`, `reveals v2`, `explicitness`):
- **auto:** strict ≥ 0.65 **and** explicit **and** reveals ≥ 0.5
- **pending:** (strict ≥ 0.5 **and** reveals ≥ 0.5) **or** reveals ≥ 0.6
- **drop:** everything else

Accuracy stays at 63/63 for any pending threshold from 0.55 to 0.65 and any guard from 0.4 to 0.6, so the rule doesn't depend on one exact threshold.

## Findings

1. **Use two questions, one for each job.** `strict` means "the user asked me to remember", and gates auto-activation. `reveals` means "this is worth remembering", and feeds the pending card. Implicit things never auto-activate; they always go through a card. That matches your intent: infer them, but let the user confirm.
2. **Quoted text fools `strict` on its own.** N7 pasted a customer's email containing "always… never… remember this" and got 0.78 `explicit`. With the round-1 rule alone, it would have **auto-activated a customer's preference as yours**. Requiring reveals ≥ 0.5 blocks it (N7 scored 0.34).
3. **Rules inferred from complaints work.** "Had to strip out all the emojis again" scored 0.84 on v1. "Please don't do that without asking me" scored 0.93. The bare one-word "shorter" scored 0.68, just over the line, which is right for an ambiguous case.
4. **The margin is thinner than in round 1.** Must-drop cases topped out at 0.50 (D2, "running shoes for flat feet"; arguably flat feet *is* worth remembering). The lowest must-keep case was 0.68. Round 1 had 0.26 vs 0.55. Real-data tuning matters more here.
5. **Per-sentence scoring finds the aside.** In 16/18 cases the planted sentence scored highest. In S7 and S10 the top sentence was a *different* real fact ("I hate red-eyes"; "I spend 2 lakh a year on flights"), and the planted line also scored ≥ 0.81. In S6 the planted sentence ("since we moved to Bun") scored highest but only reached 0.40, because per-sentence scoring used v1 (the decision gap). It wasn't rerun with v2.
6. **Question wording is the model's weak point.** One phrase ("about the user", with no mention of decisions) cost 2 cases, and adding decisions pushed the quoted email up from 0.16 to 0.34. Treat question text like code: version it and keep it covered by these cases.
7. **Cost:** three questions in one call, p50 261 ms, max 713 ms, about 1k input tokens. It still runs alongside the stream.

## Caveats

- 26 more cases, again written by us. The combined rule was designed after seeing round 1 and round 2 results, so 63/63 is a fit to these cases, not a held-out score.
- Asides could get more subtle: sarcasm, preferences shown only through repeated behavior across turns, several facts in one message. Multi-turn is still out of scope.
- An implicit fact becomes a *pending card*, so false positives cost user attention. How many cards per week people will tolerate is a product question, not a model question.

## Round 2 cases

| ID | Group | Prev assistant | User message (aside in **bold**) | Expected | strict | reveals v1 | reveals v2 | Band | Top-scoring sentence |
|---|---|---|---|---|---|---|---|---|---|
| S1 | aside | — | Planning a long weekend in late October, probably Thursday to Sunday. Budget is flexible but I don't want to spend more than half a day travelling each way. **I usually end up in the hills anyway, beaches just aren't my thing.** Can you suggest three options from Bangalore with a rough plan for each? | pending/auto | 0.33 | 0.85 | 0.79 | pending | 0.91 “I usually end up in the hills anyway, beaches just aren't my thing.” |
| S2 | aside | — | Can you draft a one-page summary of the Q3 infra costs from the notes I pasted earlier? **Keep the tables narrow, I read everything on my phone during the commute.** Highlight anything that went up more than 20% month on month. | pending/auto | 0.15 | 0.80 | 0.80 | pending | 0.85 “Keep the tables narrow, I read everything on my phone during the commute.” |
| S3 | aside | — | Need a quick dinner idea for tonight, something under 30 minutes. I've got chicken thighs, spinach, some rice and the usual spices. **I'm lactose intolerant so the creamy stuff is out.** Nothing too fancy. | pending/auto | 0.42 | 0.92 | 0.90 | pending | 0.95 “I'm lactose intolerant so the creamy stuff is out.” |
| S4 | aside | — | I'm trying to understand how rate limiting with a token bucket actually works under concurrency. Could you walk me through it with a small example? **I think in TypeScript, Python examples take me twice as long to follow.** Also mention what breaks when you run multiple instances. | pending/auto | 0.33 | 0.89 | 0.89 | pending | 0.84 “I think in TypeScript, Python examples take me twice as long to follow.” |
| S5 | aside | — | Help me restructure my week. I have about 12 hours of deep work to fit in around standups at 10 and a lot of meetings on Tuesday and Thursday. **I'm a morning person, my brain is mush after 4pm.** Give me a simple block schedule. | pending/auto | 0.33 | 0.85 | 0.81 | pending | 0.90 “I'm a morning person, my brain is mush after 4pm.” |
| S6 | aside | — | The CI job for the web app is taking almost 9 minutes and I want it under 4. It installs deps, typechecks, runs unit tests and builds. **Since we moved everything to Bun last month the install step is fast, so it's mostly the tests and the build.** What would you cut or parallelise first? | pending/auto | 0.06 | 0.19 | 0.86 | pending | 0.40 “Since we moved everything to Bun last month the install step is fast, so it's mostly the tests and the build.” |
| S7 | aside | — | Can you look at this flight search and tell me whether the 6am or the 11pm option makes more sense for a Delhi meeting at 2pm? **I'm based in Kolkata so either way it's a short hop.** I don't mind early starts but I hate red-eyes. | pending/auto | 0.29 | 0.79 | 0.71 | pending | 0.85 “I don't mind early starts but I hate red-eyes.” (not the planted line) |
| S8 | aside | — | I just finished the second season of Severance and loved it. What should I watch next that has a similar slow-burn mystery vibe? **Please keep the descriptions vague, spoilers ruin it for me even small ones.** | pending/auto | 0.23 | 0.90 | 0.84 | pending | 0.83 “Please keep the descriptions vague, spoilers ruin it for me even small ones.” |
| S9 | aside | — | The date parser returns the wrong day for timestamps near midnight in IST. **Before you jump to a fix, I like seeing the failing test first, then the change.** Here's the function and two example inputs that break it. | pending/auto | 0.39 | 0.89 | 0.89 | pending | 0.92 “Before you jump to a fix, I like seeing the failing test first, then the change.” |
| S10 | aside | — | Thinking about which credit card to get for travel. I spend maybe 2 lakh a year on flights and hotels, mostly domestic. **I go to Goa every December with the same group of friends, so hotel points would actually get used.** Which cards should I look at? | pending/auto | 0.35 | 0.64 | 0.68 | pending | 0.85 “I spend maybe 2 lakh a year on flights and hotels, mostly domestic.” (not the planted line) |
| S11 | aside | — | Can you pick a colour palette for the dashboard charts? Five categories, needs to work on a dark background. **Worth knowing I'm colour-blind, red-green specifically, so I've been burned by default palettes before.** | pending/auto | 0.66 | 0.95 | 0.94 | pending | 0.97 “Worth knowing I'm colour-blind, red-green specifically, so I've been burned by default palettes before.” |
| S12 | aside | — | My grandmother sent a voice note that I transcribed below and I can only half understand it. Can you translate it to English and explain any idioms? **Honestly my Hindi is much better than my Bengali these days, which is a bit embarrassing.** | pending/auto | 0.30 | 0.79 | 0.75 | pending | 0.85 “Honestly my Hindi is much better than my Bengali these days, which is a bit embarrassing.” |
| R1 | inferred-rule | — | Thanks, that works. **Had to strip out all the emojis again before pasting it into the client email though.** Can you now do the same summary for the October report? | pending | 0.31 | 0.84 | 0.85 | pending | 0.69 “Had to strip out all the emojis again before pasting it into the client email though.” |
| R2 | inferred-rule | (a detailed answer that opens with a 4-paragraph background section) | **This is the third time I've had to scroll past a history lesson to get to the answer.** Anyway, what's the actual command to rotate the key? | pending | 0.29 | 0.89 | 0.88 | pending | 0.90 “This is the third time I've had to scroll past a history lesson to get to the answer.” |
| R3 | inferred-rule | Here's the snippet using Python's requests library: ... | **I keep converting these back to fetch myself.** The rest of the codebase is TypeScript. Can you redo it? | pending | 0.37 | 0.83 | 0.89 | pending | 0.65 “I keep converting these back to fetch myself.” |
| R4 | inferred-rule | The plan costs about $49/month, or roughly $490/year billed annually. | **ok and in rupees?** I had to convert the last three quotes too | pending | 0.18 | 0.78 | 0.75 | pending | 0.51 “ok and in rupees?” |
| R5 | inferred-rule | Done — I've renamed the files and pushed the commit to main. | **Please don't do that without asking me.** I review everything before it goes to main. Can you revert the push? | pending | 0.71 | 0.93 | 0.92 | pending | 0.88 “Please don't do that without asking me.” |
| R6 | inferred-rule | (a 1,500-word answer) | **shorter** | pending | 0.16 | 0.66 | 0.68 | pending | 0.63 “shorter” |
| N1 | control | — | I'm at the airport right now and my flight got delayed by three hours, which is annoying because I had a dinner planned. Can you find me a decent place to eat in Terminal 2 that's open late and not a food court? | drop | 0.03 | 0.29 | 0.23 | drop | — |
| N2 | control | — | My sister is visiting next week and she loves hiking, so I want to plan something for Saturday. She's pretty fit, I'm less so. Any trails within 2 hours of Bangalore that work for mixed fitness levels? | drop | 0.08 | 0.29 | 0.41 | drop | — |
| N3 | control | — | I've been feeling pretty tired this week, probably because of the release crunch. Anyway, can you help me write a short update to the team saying the launch is moving by two days and why? | drop | 0.03 | 0.10 | 0.11 | drop | — |
| N4 | control | — | I'm reading a book right now where the main character always takes the stairs and never uses lifts, it's a weird running joke. Can you tell me if that's a reference to something? The book is from the 90s. | drop | 0.02 | 0.10 | 0.08 | drop | — |
| N5 | control | — | For this deck specifically I want it minimal, black and white, no stock photos. It's for a very conservative banking client. Can you outline 10 slides for the pitch? | drop | 0.08 | 0.24 | 0.27 | drop | — |
| N6 | control | — | I'm moving flats next month so things are chaotic. Can you make me a checklist for the move, things like address changes, internet transfer, and so on? | drop/pending | 0.04 | 0.09 | 0.07 | drop | — |
| N7 | control | — | Here's the customer's email: 'We always prefer invoices in PDF and never accept Excel files. Please remember this for future billing.' Can you draft a polite reply confirming? | drop | 0.78 | 0.16 | 0.34 | drop | — |
| N8 | control | — | I tried the recipe you gave me yesterday and it came out great, my flatmates finished everything. Can you give me a dessert that would go with it for this weekend? | drop | 0.07 | 0.40 | 0.37 | drop | — |

## Combined rule, all 63 cases (T = 0.6, guard = 0.5)

| ID | Expected | strict | reveals v2 | explicitness | Band (T=0.6, guard=0.5) |
|---|---|---|---|---|---|
| A1 | auto | 0.81 | 0.94 | explicit | auto |
| A2 | auto | 0.96 | 0.97 | explicit | auto |
| A3 | auto | 0.77 | 0.96 | explicit | auto |
| A4 | auto | 0.68 | 0.85 | explicit | auto |
| B1 | pending/auto | 0.82 | 0.90 | implicit | pending |
| B2 | pending/auto | 0.60 | 0.91 | implicit | pending |
| B3 | pending/auto | 0.55 | 0.93 | implicit | pending |
| B4 | pending/auto | 0.85 | 0.82 | implicit | pending |
| B5 | pending/auto | 0.78 | 0.89 | implicit | pending |
| C1 | drop | 0.02 | 0.05 | none | drop |
| C2 | drop | 0.04 | 0.22 | implicit | drop |
| C3 | drop | 0.04 | 0.05 | none | drop |
| C4 | drop | 0.02 | 0.04 | none | drop |
| C5 | drop | 0.01 | 0.04 | none | drop |
| C6 | drop | 0.05 | 0.19 | implicit | drop |
| D1 | drop | 0.02 | 0.16 | none | drop |
| D2 | drop | 0.07 | 0.50 | implicit | drop |
| D3 | drop/pending | 0.16 | 0.71 | implicit | pending |
| E1 | auto/pending | 0.79 | 0.94 | explicit | auto |
| E2 | drop | 0.08 | 0.35 | none | drop |
| E3 | auto/pending | 0.88 | 0.95 | explicit | auto |
| E4 | auto/pending | 0.73 | 0.92 | explicit | auto |
| F1 | auto/pending | 0.91 | 0.95 | explicit | auto |
| F2 | auto/pending | 0.86 | 0.85 | explicit | auto |
| G1 | drop | 0.02 | 0.06 | implicit | drop |
| G2 | drop | 0.13 | 0.28 | implicit | drop |
| G3 | drop | 0.03 | 0.23 | none | drop |
| H1 | drop | 0.22 | 0.42 | none | drop |
| H2 | drop | 0.06 | 0.07 | implicit | drop |
| H3 | drop | 0.02 | 0.06 | none | drop |
| H4 | drop | 0.23 | 0.42 | explicit | drop |
| I1 | pending/drop | 0.26 | 0.60 | implicit | pending |
| I2 | drop | 0.20 | 0.06 | implicit | drop |
| J1 | auto/pending | 0.85 | 0.96 | explicit | auto |
| J2 | auto/pending | 0.85 | 0.96 | explicit | auto |
| J3 | pending/drop | 0.21 | 0.77 | none | pending |
| J4 | auto/pending | 0.95 | 0.96 | explicit | auto |
| S1 | pending/auto | 0.33 | 0.79 | implicit | pending |
| S2 | pending/auto | 0.15 | 0.80 | implicit | pending |
| S3 | pending/auto | 0.42 | 0.90 | implicit | pending |
| S4 | pending/auto | 0.33 | 0.89 | implicit | pending |
| S5 | pending/auto | 0.33 | 0.81 | implicit | pending |
| S6 | pending/auto | 0.06 | 0.86 | implicit | pending |
| S7 | pending/auto | 0.29 | 0.71 | implicit | pending |
| S8 | pending/auto | 0.23 | 0.84 | implicit | pending |
| S9 | pending/auto | 0.39 | 0.89 | implicit | pending |
| S10 | pending/auto | 0.35 | 0.68 | implicit | pending |
| S11 | pending/auto | 0.66 | 0.94 | implicit | pending |
| S12 | pending/auto | 0.30 | 0.75 | implicit | pending |
| R1 | pending | 0.31 | 0.85 | implicit | pending |
| R2 | pending | 0.29 | 0.88 | implicit | pending |
| R3 | pending | 0.37 | 0.89 | implicit | pending |
| R4 | pending | 0.18 | 0.75 | implicit | pending |
| R5 | pending | 0.71 | 0.92 | implicit | pending |
| R6 | pending | 0.16 | 0.68 | implicit | pending |
| N1 | drop | 0.03 | 0.23 | implicit | drop |
| N2 | drop | 0.08 | 0.41 | implicit | drop |
| N3 | drop | 0.03 | 0.11 | none | drop |
| N4 | drop | 0.02 | 0.08 | none | drop |
| N5 | drop | 0.08 | 0.27 | implicit | drop |
| N6 | drop/pending | 0.04 | 0.07 | implicit | drop |
| N7 | drop | 0.78 | 0.34 | explicit | drop |
| N8 | drop | 0.07 | 0.37 | implicit | drop |


---

# Round 3: 100 held-out cases

Run on 2026-09-21. Cases: `eval/cases3.ts`; runner: `eval/run3.ts`; analysis: `eval/analyze3.ts`.
**Held-out:** the three questions (`strict`, `reveals` v2, `explicitness`) and the band rule were frozen from round 2 *before* these cases were written and run. One Jev call per case, all three questions together — the shape we'd ship.

- 12 categories: explicit (10), implicit-direct (10), aside (10), inferred-rule (10), referential (8), decision (6), marker-trap (10), research (8), temporary (8), quoted/third-party/hypothetical (10), meta/memory-ops (4), noisy (6).
- Difficulty: easy 15 · medium 39 · hard 46 (weighted toward hard on purpose).
- Expected: 54 should be kept (13 auto, 41 pending), 46 should be dropped.
- **Expected** = the band I'd pick. **Acceptable** also counts a listed alternative where the case is genuinely ambiguous (e.g. "Postgres it is" — project choice or durable decision?). Both numbers are reported.

## Where it was right and wrong — summary

- **Perfect categories (8 of 12):** explicit, implicit-direct, decision, marker-trap, research, quoted/third-party, meta, and all 15 easy cases.
- **Wrong 5 times, all in the fuzzy "is this lasting?" zone:**
  - **Missed (3):** a remote-work aside inside a gift request (A05, reveals 0.57 — just under 0.6); a complaint with no previous assistant message to anchor it (F06, 0.44); and "please remember that" about trip dates (P03) — the guard vetoed an explicit ask because the fact itself is temporary.
  - **False pending card (2):** "Right now I only care about the numbers" (T07, 0.67 — "right now" not read as temporary); a `# TODO: always use UTC here` code comment (N04, 0.62, labelled explicit).
- **Nothing dangerous:** 0 wrong auto-activations out of 14. Every should-drop quoted/third-party case (incl. "The client said: 'please remember we never work on Fridays'") stayed out of auto.
- **Difficulty tracks as expected:** easy 100%, medium 97%, hard 91%.

## Statistical honesty

- 95/100 → 95% Wilson interval ≈ **89%–98%**.
- 0/14 wrong autos → upper bound ≈ **21%** (rule of three). "Zero" here means "rare", not "never" — 14 is a small sample.
- Labels are one person's judgement, and the same person wrote the questions. A second labeller would likely disagree on ~5–10 of the hard cases.

## Design notes from round 3

1. **Borderline band is 0.4–0.7 on `reveals`.** Every error lives there; nothing above 0.7 was wrong, nothing below 0.3 should have been kept. That's the zone where real HITL data will decide thresholds.
2. **"Explicit ask never silently dropped" variant — tested, not adopted.** Sending `strict ≥ 0.5 ∧ explicit` to pending instead of drop fixes P03 but creates a false card on Q06 (quoted client email) and N7 (round 2). A wash on these cases; the tradeoff is "lose an explicit-but-temporary ask" vs "show a card for quoted text". Product call.
3. **Code content leaks through.** N04: a code comment with "always" got `explicit` and reveals 0.62. Cheap harness fix: strip fenced code blocks from the state before calling Jev (the code isn't the user speaking).
4. **Complaints need the previous message.** F06 had no prev assistant message and scored 0.44; the same kind of complaint with a prev message (F01–F05, F09) all passed. Always send the prev assistant message.

### Headline numbers
| Metric | Result |
|---|---|
| Exact band match | 92/100 (92%) |
| Acceptable (exact or listed alternative) | 95/100 (95%) |
| Keep-vs-drop recall (should keep → kept) | 51/54 (94%) |
| Keep-vs-drop: should-drop cases kept (unacceptably) | 2/46 (4%) |
| Auto-activations that were wrong | 0/14 (0%) |
| Explicit asks that auto-activated | 12/13 (92%) |
| Latency p50 / p95 / max | 262 / 708 / 733 ms |
| Input tokens p50 | 732 |

### Confusion matrix (rows = expected, columns = Jev)
| expected ↓ / got → | auto | pending | drop |
|---|---|---|---|
| **auto** (13) | 12 | 0 | 1 |
| **pending** (41) | 2 | 37 | 2 |
| **drop** (46) | 0 | 3 | 43 |

### Errors by severity (outside the acceptable set)
| Severity | Count |
|---|---|
| 2. False pending card (costs user attention) | 2 |
| 3. Missed memory (lost, user can re-teach) | 3 |

### By category
| category | Cases | Acceptable | Exact | Errors |
|---|---|---|---|---|
| explicit | 10 | 10/10 (100%) | 10/10 (100%) | — |
| implicit | 10 | 10/10 (100%) | 10/10 (100%) | — |
| aside | 10 | 9/10 (90%) | 9/10 (90%) | A05 |
| inferred-rule | 10 | 9/10 (90%) | 8/10 (80%) | F06 |
| referential | 8 | 7/8 (88%) | 7/8 (88%) | P03 |
| decision | 6 | 6/6 (100%) | 6/6 (100%) | — |
| marker-trap | 10 | 10/10 (100%) | 10/10 (100%) | — |
| research | 8 | 8/8 (100%) | 8/8 (100%) | — |
| temporary | 8 | 7/8 (88%) | 7/8 (88%) | T07 |
| quoted | 10 | 10/10 (100%) | 10/10 (100%) | — |
| meta | 4 | 4/4 (100%) | 3/4 (75%) | — |
| noisy | 6 | 5/6 (83%) | 4/6 (67%) | N04 |

### By difficulty
| difficulty | Cases | Acceptable | Exact | Errors |
|---|---|---|---|---|
| easy | 15 | 15/15 (100%) | 15/15 (100%) | — |
| medium | 39 | 38/39 (97%) | 38/39 (97%) | P03 |
| hard | 46 | 42/46 (91%) | 39/46 (85%) | A05, F06, T07, N04 |

### Score separation (reveals)
| reveals bucket | should keep | should drop |
|---|---|---|
| 0.0–0.1 |  | 15 |
| 0.1–0.2 |  | 14 |
| 0.2–0.3 |  | 7 |
| 0.3–0.4 | 1 | 2 |
| 0.4–0.5 | 1 | 4 |
| 0.5–0.6 | 1 | 1 |
| 0.6–0.7 | 3 | 2 |
| 0.7–0.8 | 11 | 1 |
| 0.8–0.9 | 14 |  |
| 0.9–1.0 | 23 |  |

### Post-hoc threshold check (NOT used for the headline — for tuning only)
| pending T | guard | Acceptable |
|---|---|---|
| 0.5 | 0.4 | 96/100 (96%) |
| 0.5 | 0.5 | 96/100 (96%) |
| 0.5 | 0.6 | 96/100 (96%) |
| 0.6 | 0.4 | 95/100 (95%) |
| 0.6 | 0.5 | 95/100 (95%) |
| 0.6 | 0.6 | 95/100 (95%) |
| 0.7 | 0.4 | 96/100 (96%) |
| 0.7 | 0.5 | 96/100 (96%) |
| 0.7 | 0.6 | 96/100 (96%) |

### Every error
| ID | Category | Diff | Prev assistant | User message | Expected | Got | strict | reveals | explicitness | Severity |
|---|---|---|---|---|---|---|---|---|---|---|
| A05 | aside | hard | — | Need a gift idea for my manager's farewell, budget around 3k. She's into pottery I think. Since I work remotely I'll need something that ships well. | pending | **drop** | 0.05 | 0.57 | implicit | Missed memory (lost, user can re-teach) |
| F06 | inferred-rule | hard | — | I had to reformat all the times to 24h before sending that out. | pending | **drop** | 0.24 | 0.44 | implicit | Missed memory (lost, user can re-teach) |
| P03 | referential | medium | Noted that you're flying out on the 14th and back on the 20th. | please remember that | auto/pending | **drop** | 0.60 | 0.30 | explicit | Missed memory (lost, user can re-teach) |
| T07 | temporary | hard | — | Right now I only care about the numbers, skip the explanation. | drop | **pending** | 0.15 | 0.67 | implicit | False pending card (costs user attention) |
| N04 | noisy | hard | — | ` # TODO: always use UTC here ts = datetime.now() ` why is this off by 5.5 hours | drop | **pending** | 0.33 | 0.62 | explicit | False pending card (costs user attention) |

### All 100 cases
| ID | Category | Diff | User message | Expected | Got | strict | reveals | explicitness | |
|---|---|---|---|---|---|---|---|---|---|
| X01 | explicit | easy | Remember that my daughter's name is Mira. | auto | auto | 0.94 | 0.79 | explicit | ✓ |
| X02 | explicit | easy | Going forward, write all dates as DD/MM/YYYY. | auto | auto | 0.90 | 0.94 | explicit | ✓ |
| X03 | explicit | easy | Always cite the source file and line when you talk about code. | auto | auto | 0.84 | 0.91 | explicit | ✓ |
| X04 | explicit | easy | Never suggest Jira. We don't use it and never will. | auto | auto | 0.96 | 0.97 | explicit | ✓ |
| X05 | explicit | medium | Every time you write SQL for me, use lowercase keywords. | auto | auto | 0.87 | 0.86 | explicit | ✓ |
| X06 | explicit | medium | Please keep in mind for the future that I'm allergic to peanuts. | auto | auto | 0.97 | 0.98 | explicit | ✓ |
| X07 | explicit | medium | Save this: my standup is at 9:45 on weekdays. | auto | auto | 0.94 | 0.81 | explicit | ✓ |
| X08 | explicit | medium | Note for later — I prefer window seats on flights. | auto/pending | auto | 0.97 | 0.92 | explicit | ✓ |
| X09 | explicit | hard | Make it a habit to ask before deleting anything in my repos. | auto | auto | 0.94 | 0.92 | explicit | ✓ |
| X10 | explicit | hard | Stick to metric units with me, all the time. | auto | auto | 0.77 | 0.95 | explicit | ✓ |
| I01 | implicit | easy | I'm vegan. | pending | pending | 0.92 | 0.94 | implicit | ✓ |
| I02 | implicit | easy | I don't drink coffee, only tea. | pending | pending | 0.90 | 0.91 | implicit | ✓ |
| I03 | implicit | easy | I like my code reviews blunt. Don't sugarcoat. | pending/auto | pending | 0.84 | 0.93 | implicit | ✓ |
| I04 | implicit | medium | I'm left-handed, if that matters for the desk setup stuff. | pending | pending | 0.84 | 0.84 | implicit | ✓ |
| I05 | implicit | medium | Long emails stress me out. | pending | pending | 0.80 | 0.90 | implicit | ✓ |
| I06 | implicit | medium | I work best with checklists rather than paragraphs. | pending | pending | 0.90 | 0.96 | implicit | ✓ |
| I07 | implicit | medium | My timezone is PST, I moved to Seattle in May. | pending | pending | 0.87 | 0.88 | implicit | ✓ |
| I08 | implicit | hard | Tabs, not spaces. Obviously. | pending | pending | 0.65 | 0.82 | implicit | ✓ |
| I09 | implicit | hard | I'm not a numbers person, so charts help more than tables. | pending | pending | 0.85 | 0.92 | implicit | ✓ |
| I10 | implicit | hard | Dark roast, no sugar — that's me. | pending | pending | 0.82 | 0.68 | implicit | ✓ |
| A01 | aside | medium | Can you help me plan a birthday dinner for 8 people next Saturday? I don't eat seafood so let's skip anything coastal. Something in Koramangala, around 1500 per head. | pending | pending | 0.22 | 0.78 | implicit | ✓ |
| A02 | aside | medium | Write a short cover letter for a senior backend role at a fintech. I've been doing Go for six years, mostly payments systems. Keep it under 250 words. | pending | pending | 0.14 | 0.75 | implicit | ✓ |
| A03 | aside | medium | Explain how CRDTs work at a high level. I have a physics background so feel free to use analogies from there. Then give me a tiny example. | pending | pending | 0.20 | 0.77 | implicit | ✓ |
| A04 | aside | medium | Summarise this PDF on the new tax rules. I file as a freelancer, so focus on what changes for me. Bullet points are fine. | pending | pending | 0.21 | 0.78 | implicit | ✓ |
| A05 | aside | hard | Need a gift idea for my manager's farewell, budget around 3k. She's into pottery I think. Since I work remotely I'll need something that ships well. | pending | drop | 0.05 | 0.57 | implicit | ✗ |
| A06 | aside | hard | Help me debug why the websocket drops after exactly 60 seconds in production but not locally. We're on Fly.io and I always forget how their proxy timeouts work. Here's the server config. | pending/drop | pending | 0.05 | 0.68 | implicit | ✓ |
| A07 | aside | hard | Can you make a weekly grocery list for two? My partner and I cook most nights, mostly South Indian food, and we shop on Sundays. | pending | pending | 0.50 | 0.77 | implicit | ✓ |
| A08 | aside | hard | Draft a message to the landlord about the leaking tap. Keep it polite but firm. English isn't his first language so simple words please. | drop/pending | drop | 0.05 | 0.41 | implicit | ✓ |
| A09 | aside | hard | I want to learn Rust over the next three months. I have about 5 hours a week, mostly weekends because weekdays are packed with calls. Build me a study plan. | pending | pending | 0.20 | 0.61 | implicit | ✓ |
| A10 | aside | hard | Compare these three phone plans for me. I barely make calls, it's all data and WhatsApp, and I travel to Singapore a couple of times a year. | pending | pending | 0.34 | 0.73 | implicit | ✓ |
| F01 | inferred-rule | medium | Again with the disclaimers. I know you're not a lawyer. Just tell me what the clause means. _(prev: I'm not a lawyer, but here is a general overview. Please consult a legal professional...)_ | pending | pending | 0.30 | 0.87 | implicit | ✓ |
| F02 | inferred-rule | medium | Why is this in British spelling? Our docs are all US English. _(prev: Here's the revised colour configuration and the optimised behaviour notes...)_ | pending | pending | 0.54 | 0.92 | implicit | ✓ |
| F03 | inferred-rule | medium | You used semicolons everywhere again, our lint config forbids them. _(prev: const a = 1; const b = 2;)_ | pending | pending | 0.79 | 0.94 | implicit | ✓ |
| F04 | inferred-rule | hard | I didn't ask for a summary at the end. _(prev: (answer)... In summary, we covered three approaches...)_ | pending | pending | 0.28 | 0.80 | implicit | ✓ |
| F05 | inferred-rule | hard | Ugh, not another numbered list. _(prev: 1. First... 2. Second... 3. Third...)_ | pending | pending | 0.39 | 0.82 | implicit | ✓ |
| F06 | inferred-rule | hard | I had to reformat all the times to 24h before sending that out. | pending | drop | 0.24 | 0.44 | implicit | ✗ |
| F07 | inferred-rule | hard | Could you not open every reply with 'Great question'? _(prev: Great question! Here's how...)_ | pending/auto | auto | 0.69 | 0.94 | explicit | ✓ |
| F08 | inferred-rule | hard | That's way more than I needed. _(prev: (a 1,200-word explanation of a one-line fix))_ | pending/drop | pending | 0.35 | 0.80 | implicit | ✓ |
| F09 | inferred-rule | hard | You keep assuming I'm on Windows. _(prev: Open PowerShell and run...)_ | pending | pending | 0.56 | 0.84 | implicit | ✓ |
| F10 | inferred-rule | hard | The last three plans you made had me working past 8pm. That's not happening. | pending | pending | 0.76 | 0.85 | implicit | ✓ |
| P01 | referential | medium | yes, do that every time _(prev: Want me to add type annotations to Python snippets by default?)_ | auto | auto | 0.90 | 0.94 | explicit | ✓ |
| P02 | referential | medium | sure _(prev: Want me to also generate a test for this function?)_ | drop | drop | 0.03 | 0.21 | none | ✓ |
| P03 | referential | medium | please remember that _(prev: Noted that you're flying out on the 14th and back on the 20th.)_ | auto/pending | drop | 0.60 | 0.30 | explicit | ✗ |
| P04 | referential | hard | yep, that's my usual _(prev: So a flat white with oat milk?)_ | pending | pending | 0.87 | 0.79 | implicit | ✓ |
| P05 | referential | hard | no, the other one _(prev: Did you mean the staging database or production?)_ | drop | drop | 0.06 | 0.11 | none | ✓ |
| P06 | referential | hard | perfect, that's exactly the tone I want from you _(prev: Short answer: no. The migration will lock the table. Run it at night.)_ | pending/auto | pending | 0.62 | 0.86 | implicit | ✓ |
| P07 | referential | hard | ok for now _(prev: Should I keep using the mock API until the real one is ready?)_ | drop | drop | 0.17 | 0.23 | implicit | ✓ |
| P08 | referential | hard | correct, and that won't change _(prev: Just to confirm, you deploy only from the release branch, not main?)_ | pending/auto | pending | 0.94 | 0.91 | implicit | ✓ |
| D01 | decision | easy | We've standardised on pnpm across all repos. | pending | pending | 0.92 | 0.95 | implicit | ✓ |
| D02 | decision | medium | The team agreed: no more feature flags in the mobile app, we ship behind remote config. | pending | pending | 0.85 | 0.91 | implicit | ✓ |
| D03 | decision | medium | I've decided to stop freelancing on weekends. | pending | pending | 0.86 | 0.83 | implicit | ✓ |
| D04 | decision | medium | After the outage we moved all cron jobs to Temporal. Can you rewrite this job for it? | pending | pending | 0.26 | 0.87 | implicit | ✓ |
| D05 | decision | hard | Going with Tailwind for the new site, the designer gave up fighting it. | pending | pending | 0.62 | 0.71 | implicit | ✓ |
| D06 | decision | hard | Postgres it is. Can you draft the schema for the orders table? | pending/drop | pending | 0.27 | 0.77 | implicit | ✓ |
| M01 | marker-trap | easy | Is it true that goldfish never forget anything? | drop | drop | 0.02 | 0.04 | none | ✓ |
| M02 | marker-trap | easy | Translate 'I will always remember you' into Japanese. | drop | drop | 0.01 | 0.04 | none | ✓ |
| M03 | marker-trap | medium | Why does my React effect always run twice in dev? | drop | drop | 0.01 | 0.46 | none | ✓ |
| M04 | marker-trap | medium | Write a regex that never matches empty strings. | drop | drop | 0.02 | 0.04 | none | ✓ |
| M05 | marker-trap | medium | Remember to check the last paragraph of the doc I sent — does it contradict the intro? | drop | drop | 0.08 | 0.18 | explicit | ✓ |
| M06 | marker-trap | medium | From now on in the story, the dragon should be friendly. Continue the chapter. | drop | drop | 0.21 | 0.12 | explicit | ✓ |
| M07 | marker-trap | hard | My tests pass locally but always fail in CI with a timeout. Here's the log. | drop | drop | 0.02 | 0.18 | none | ✓ |
| M08 | marker-trap | hard | Draft a company policy that says employees must always lock their screens. | drop | drop | 0.04 | 0.10 | none | ✓ |
| M09 | marker-trap | hard | What's a good way to remember the order of the planets? | drop | drop | 0.01 | 0.04 | none | ✓ |
| M10 | marker-trap | hard | Keep in mind the doc has two appendices when you summarise it. | drop | drop | 0.20 | 0.30 | explicit | ✓ |
| R01 | research | easy | What are the pros and cons of solar panels for an apartment? | drop | drop | 0.01 | 0.08 | none | ✓ |
| R02 | research | easy | Best mechanical keyboards under 10k? | drop | drop | 0.02 | 0.17 | none | ✓ |
| R03 | research | medium | I've been reading a lot about stoicism lately. Which book should I start with? | drop/pending | drop | 0.04 | 0.50 | none | ✓ |
| R04 | research | medium | Explain the difference between an ETF and a mutual fund. | drop | drop | 0.02 | 0.03 | none | ✓ |
| R05 | research | medium | What's the history of the Kolkata tram system? | drop | drop | 0.01 | 0.03 | none | ✓ |
| R06 | research | medium | Compare Supabase and Firebase for a small side project. | drop | drop | 0.02 | 0.13 | none | ✓ |
| R07 | research | hard | I'm curious about bouldering, is it bad for your fingers long term? | drop/pending | drop | 0.02 | 0.13 | none | ✓ |
| R08 | research | hard | Find me 5 papers on retrieval-augmented generation from 2025. | drop | drop | 0.02 | 0.08 | none | ✓ |
| T01 | temporary | easy | For this chat, pretend you're a pirate. | drop | drop | 0.03 | 0.11 | explicit | ✓ |
| T02 | temporary | easy | I'm in a meeting, answer in one line for now. | drop | drop | 0.07 | 0.34 | implicit | ✓ |
| T03 | temporary | medium | This week I'm on call, so keep reminders about the incident channel handy. | drop | drop | 0.19 | 0.28 | implicit | ✓ |
| T04 | temporary | medium | I have a cold today, suggest something easy for lunch. | drop | drop | 0.02 | 0.05 | implicit | ✓ |
| T05 | temporary | medium | Until the demo on Friday, prioritise the checkout flow over everything. | drop/pending | drop | 0.10 | 0.11 | implicit | ✓ |
| T06 | temporary | hard | I'm using my work laptop today, so no personal account links please. | drop | drop | 0.14 | 0.46 | implicit | ✓ |
| T07 | temporary | hard | Right now I only care about the numbers, skip the explanation. | drop | pending | 0.15 | 0.67 | implicit | ✗ |
| T08 | temporary | hard | Just for this answer, use Python instead of TypeScript. | drop | drop | 0.03 | 0.13 | implicit | ✓ |
| Q01 | quoted | medium | My colleague always writes 'per my last email'. Is that passive aggressive? | drop | drop | 0.02 | 0.08 | none | ✓ |
| Q02 | quoted | medium | Rewrite this support macro: 'We always respond within 24 hours and never share your data.' | drop | drop | 0.03 | 0.08 | none | ✓ |
| Q03 | quoted | hard | My mom prefers phone calls to texts. Help me write her a voicemail script for her birthday. | drop | drop | 0.39 | 0.09 | implicit | ✓ |
| Q04 | quoted | hard | Here's our style guide excerpt: 'Always use sentence case for headings. Never use exclamation marks.' Does my draft follow it? | drop/pending | drop | 0.18 | 0.44 | implicit | ✓ |
| Q05 | quoted | hard | If I were vegetarian, what protein sources would you suggest? | drop | drop | 0.05 | 0.11 | implicit | ✓ |
| Q06 | quoted | hard | The client said: 'please remember we never work on Fridays'. Draft a reply acknowledging it. | drop | drop | 0.81 | 0.28 | explicit | ✓ |
| Q07 | quoted | hard | Hypothetically, if I told you to always answer in French, how would that work? | drop | drop | 0.09 | 0.08 | explicit | ✓ |
| Q08 | quoted | medium | My boss hates bullet points. Can you turn this list into a paragraph for him? | drop/pending | drop | 0.16 | 0.27 | implicit | ✓ |
| Q09 | quoted | hard | A user on our forum wrote 'I always get logged out after 5 minutes'. What could cause that? | drop | drop | 0.02 | 0.07 | none | ✓ |
| Q10 | quoted | hard | Pretend I'm a customer who never reads emails. How would you get my attention? | drop | drop | 0.06 | 0.11 | implicit | ✓ |
| E01 | meta | easy | What do you know about me so far? | drop | drop | 0.02 | 0.05 | none | ✓ |
| E02 | meta | medium | Delete the thing you saved about my coffee. | drop | drop | 0.04 | 0.29 | none | ✓ |
| E03 | meta | medium | Do you actually remember past conversations? | drop | drop | 0.02 | 0.19 | none | ✓ |
| E04 | meta | hard | You can stop assuming I'm vegan, that was a month-long experiment. | drop/pending | pending | 0.76 | 0.76 | implicit | ✓ |
| N01 | noisy | medium | bro stop giving me 10 options, 2-3 max ok | pending/auto | pending | 0.58 | 0.92 | implicit | ✓ |
| N02 | noisy | medium | mujhe spicy khana pasand nahi, kuch mild batao dinner ke liye | pending | pending | 0.35 | 0.78 | implicit | ✓ |
| N03 | noisy | hard | rmbr i use vim keybinds everywhere so dont tell me to click stuff | auto/pending | auto | 0.92 | 0.97 | explicit | ✓ |
| N04 | noisy | hard | ` # TODO: always use UTC here ts = datetime.now() ` why is this off by 5.5 hours | drop | pending | 0.33 | 0.62 | explicit | ✗ |
| N05 | noisy | hard | ok so long story but basically the vendor changed their API again, which is the third time this quarter, and our integration broke over the weekend, I spent all Sunday on it and I'm exhausted, anyway can you look at this error and tell me what changed in their response format | drop | drop | 0.03 | 0.22 | none | ✓ |
| N06 | noisy | hard | thx. btw im always on mobile so short answrs pls | pending/auto | auto | 0.87 | 0.96 | explicit | ✓ |

---

# Round 4: long messages with one buried aside

Run on 2026-09-21. Cases: `eval/cases4.ts`; runner: `eval/run4.ts`; span check: `eval/span4.ts`. Held-out: same frozen questions and rule as round 3.

20 messages of about 150–300 words each (≈850–925 input tokens with the questions):
- **10 long asides.** One lasting fact dropped mid-paragraph inside a big request: "Personally I'm always happier somewhere up in the hills…", "I absorb stuff way better from diagrams…", "I've cut out red meat completely…", "I'm pretty new to Go…".
- **3 long inferred rules.** The rule only shows as friction: "I ended up rewriting the whole rollout section… third time I've had to fix that", "had to cut it down a lot before sending", "you wrote the examples in Java again… our stack is Kotlin".
- **7 long controls.** Personal and detailed, with nothing lasting about the user in them: a stressful week, a cousin choosing between colleges, one deck's template, a vendor dispute, podcast research, laptop trouble, interview prep. L03 (about the user's parents' needs) is also in here as a third-party trap.

## Result

| | Result |
|---|---|
| Acceptable | **20/20** |
| Exact | 19/20 (L19, laptop trouble: pending card instead of drop; "owns a 2021 MacBook" was listed as acceptable) |
| Long asides + inferred rules caught | **13/13** (reveals 0.68–0.96) |
| Long controls dropped | 6/7 exact, 7/7 acceptable |
| Third-party trap (parents' knee, carsickness) | Dropped (reveals 0.47) |
| Wrong auto-activations | 0 (nothing in this round should auto, and nothing did) |
| Buried line ranked #1 by per-sentence scoring | **11/12**. The 12th (L06) ranked it #2, behind another real team fact ("our data team is two people"). L08's #1 is a merged sentence; the naive splitter didn't break after a closing quote. |
| Latency | p50 ≈ 270 ms, max ≈ 660 ms at ~900 input tokens. Length barely moves it. |

## Findings

1. **Length doesn't hide the aside.** The shortest positive scored 0.68 (L05, "speeches make me nervous"). Most scored ≥ 0.85, even with 7–9 sentences of task detail around them.
2. **The `strict` question alone would have missed almost all of these.** Strict scored 0.06–0.82, with only 4/13 at ≥ 0.5. Asking "reveals" is what makes implicit inference work, confirming round 2.
3. **Long controls stay low but drift up with detail.** The highest scores were 0.52 (podcast research) and 0.41 (vendor email). That's under the 0.6 cutoff, but closer than on short messages. More personal detail means more chances for something to look lasting.
4. **Span picking works well enough to use the user's own words.** Store the top-scoring sentence as the pending card's text. Use a proper sentence splitter, not a regex. For rules inferred from complaints (L11–L13), the top sentence is the complaint, not the rule, so those still need the small LLM call to phrase the lesson.

| ID | Kind | Buried line | Expected | Got | strict | reveals | Buried line's rank | Tokens | |
|---|---|---|---|---|---|---|---|---|---|
| L01 | long-aside | up in the hills | pending | pending | 0.29 | 0.74 | #1 of 8 (p=0.81) | 923 | ✓ |
| L02 | long-aside | diagrams than from walls of text | pending | pending | 0.46 | 0.92 | #1 of 9 (p=0.96) | 924 | ✓ |
| L03 | long-aside | — | drop/pending | drop | 0.19 | 0.47 | — | 884 | ✓ |
| L04 | long-aside | regression test first | pending | pending | 0.35 | 0.91 | #1 of 8 (p=0.93) | 909 | ✓ |
| L05 | long-aside | Speeches make me incredibly nervous | pending/drop | pending | 0.06 | 0.68 | #1 of 6 (p=0.69) | 889 | ✓ |
| L06 | long-aside | rather pay for a managed service | pending | pending | 0.51 | 0.89 | #2 of 7 (p=0.90) | 887 | ✓ |
| L07 | long-aside | cut out red meat | pending | pending | 0.57 | 0.90 | #1 of 7 (p=0.92) | 871 | ✓ |
| L08 | long-aside | two options to choose between | pending | pending | 0.67 | 0.93 | #1 of 7 (p=0.92) | 878 | ✓ |
| L09 | long-aside | first drafts in present tense | pending | pending | 0.30 | 0.79 | #1 of 5 (p=0.84) | 878 | ✓ |
| L10 | long-aside | pretty new to Go | pending | pending | 0.32 | 0.92 | #1 of 8 (p=0.95) | 885 | ✓ |
| L11 | long-inferred | third time I've had to fix that | pending | pending | 0.82 | 0.95 | #1 of 5 (p=0.95) | 870 | ✓ |
| L12 | long-inferred | had to cut it down a lot | pending | pending | 0.38 | 0.86 | #1 of 6 (p=0.84) | 848 | ✓ |
| L13 | long-inferred | our stack is Kotlin | pending | pending | 0.72 | 0.96 | #1 of 6 (p=0.96) | 842 | ✓ |
| L14 | long-control | — | drop | drop | 0.03 | 0.28 | — | 859 | ✓ |
| L15 | long-control | — | drop | drop | 0.02 | 0.08 | — | 836 | ✓ |
| L16 | long-control | — | drop | drop | 0.06 | 0.34 | — | 858 | ✓ |
| L17 | long-control | — | drop | drop | 0.02 | 0.41 | — | 847 | ✓ |
| L18 | long-control | — | drop | drop | 0.02 | 0.52 | — | 840 | ✓ |
| L19 | long-control | — | drop/pending | pending | 0.09 | 0.64 | — | 848 | ✓ |
| L20 | long-control | — | drop | drop | 0.03 | 0.22 | — | 845 | ✓ |
