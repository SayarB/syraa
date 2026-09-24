## Headline
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

## Confusion matrix (rows = expected, columns = Jev)
| expected ↓ / got → | auto | pending | drop |
|---|---|---|---|
| **auto** (13) | 12 | 0 | 1 |
| **pending** (41) | 2 | 37 | 2 |
| **drop** (46) | 0 | 3 | 43 |

## Errors by severity (outside the acceptable set)
| Severity | Count |
|---|---|
| 2. False pending card (costs user attention) | 2 |
| 3. Missed memory (lost, user can re-teach) | 3 |

## By category
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

## By difficulty
| difficulty | Cases | Acceptable | Exact | Errors |
|---|---|---|---|---|
| easy | 15 | 15/15 (100%) | 15/15 (100%) | — |
| medium | 39 | 38/39 (97%) | 38/39 (97%) | P03 |
| hard | 46 | 42/46 (91%) | 39/46 (85%) | A05, F06, T07, N04 |

## Score separation (reveals)
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

## Post-hoc threshold check (NOT used for the headline — for tuning only)
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

## Every error
| ID | Category | Diff | Prev assistant | User message | Expected | Got | strict | reveals | explicitness | Severity |
|---|---|---|---|---|---|---|---|---|---|---|
| A05 | aside | hard | — | Need a gift idea for my manager's farewell, budget around 3k. She's into pottery I think. Since I work remotely I'll need something that ships well. | pending | **drop** | 0.05 | 0.57 | implicit | Missed memory (lost, user can re-teach) |
| F06 | inferred-rule | hard | — | I had to reformat all the times to 24h before sending that out. | pending | **drop** | 0.24 | 0.44 | implicit | Missed memory (lost, user can re-teach) |
| P03 | referential | medium | Noted that you're flying out on the 14th and back on the 20th. | please remember that | auto/pending | **drop** | 0.60 | 0.30 | explicit | Missed memory (lost, user can re-teach) |
| T07 | temporary | hard | — | Right now I only care about the numbers, skip the explanation. | drop | **pending** | 0.15 | 0.67 | implicit | False pending card (costs user attention) |
| N04 | noisy | hard | — | ` # TODO: always use UTC here ts = datetime.now() ` why is this off by 5.5 hours | drop | **pending** | 0.33 | 0.62 | explicit | False pending card (costs user attention) |

## All 100 cases
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