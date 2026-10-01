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
