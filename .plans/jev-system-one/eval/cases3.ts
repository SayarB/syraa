// Round 3: 100 held-out cases. The band rule is FROZEN from round 2 before these were run.
// expect = the single band we think is right; accept = other bands we'd still call acceptable (genuinely ambiguous).
import type { Band } from "./cases.ts";

export type Difficulty = "easy" | "medium" | "hard";
export type Case3 = {
  id: string;
  cat: string;
  diff: Difficulty;
  prev?: string;
  user: string;
  expect: Band;
  accept?: Band[];
  note?: string;
};

const c = (id: string, cat: string, diff: Difficulty, user: string, expect: Band, extra: Partial<Case3> = {}): Case3 =>
  ({ id, cat, diff, user, expect, ...extra });

export const cases3: Case3[] = [
  // 1. explicit — asks to remember / apply going forward (expect auto)
  c("X01", "explicit", "easy", "Remember that my daughter's name is Mira.", "auto"),
  c("X02", "explicit", "easy", "Going forward, write all dates as DD/MM/YYYY.", "auto"),
  c("X03", "explicit", "easy", "Always cite the source file and line when you talk about code.", "auto"),
  c("X04", "explicit", "easy", "Never suggest Jira. We don't use it and never will.", "auto"),
  c("X05", "explicit", "medium", "Every time you write SQL for me, use lowercase keywords.", "auto"),
  c("X06", "explicit", "medium", "Please keep in mind for the future that I'm allergic to peanuts.", "auto"),
  c("X07", "explicit", "medium", "Save this: my standup is at 9:45 on weekdays.", "auto"),
  c("X08", "explicit", "medium", "Note for later — I prefer window seats on flights.", "auto", { accept: ["pending"] }),
  c("X09", "explicit", "hard", "Make it a habit to ask before deleting anything in my repos.", "auto", { note: "no classic marker words" }),
  c("X10", "explicit", "hard", "Stick to metric units with me, all the time.", "auto"),

  // 2. implicit-direct — preference stated plainly, no ask to remember (expect pending)
  c("I01", "implicit", "easy", "I'm vegan.", "pending"),
  c("I02", "implicit", "easy", "I don't drink coffee, only tea.", "pending"),
  c("I03", "implicit", "easy", "I like my code reviews blunt. Don't sugarcoat.", "pending", { accept: ["auto"] }),
  c("I04", "implicit", "medium", "I'm left-handed, if that matters for the desk setup stuff.", "pending"),
  c("I05", "implicit", "medium", "Long emails stress me out.", "pending"),
  c("I06", "implicit", "medium", "I work best with checklists rather than paragraphs.", "pending"),
  c("I07", "implicit", "medium", "My timezone is PST, I moved to Seattle in May.", "pending"),
  c("I08", "implicit", "hard", "Tabs, not spaces. Obviously.", "pending", { note: "terse, no context" }),
  c("I09", "implicit", "hard", "I'm not a numbers person, so charts help more than tables.", "pending"),
  c("I10", "implicit", "hard", "Dark roast, no sugar — that's me.", "pending"),

  // 3. aside — durable fact buried in a bigger one-off request (expect pending)
  c("A01", "aside", "medium", "Can you help me plan a birthday dinner for 8 people next Saturday? I don't eat seafood so let's skip anything coastal. Something in Koramangala, around 1500 per head.", "pending"),
  c("A02", "aside", "medium", "Write a short cover letter for a senior backend role at a fintech. I've been doing Go for six years, mostly payments systems. Keep it under 250 words.", "pending"),
  c("A03", "aside", "medium", "Explain how CRDTs work at a high level. I have a physics background so feel free to use analogies from there. Then give me a tiny example.", "pending"),
  c("A04", "aside", "medium", "Summarise this PDF on the new tax rules. I file as a freelancer, so focus on what changes for me. Bullet points are fine.", "pending"),
  c("A05", "aside", "hard", "Need a gift idea for my manager's farewell, budget around 3k. She's into pottery I think. Since I work remotely I'll need something that ships well.", "pending"),
  c("A06", "aside", "hard", "Help me debug why the websocket drops after exactly 60 seconds in production but not locally. We're on Fly.io and I always forget how their proxy timeouts work. Here's the server config.", "pending", { accept: ["drop"], note: "deploy platform is durable-ish" }),
  c("A07", "aside", "hard", "Can you make a weekly grocery list for two? My partner and I cook most nights, mostly South Indian food, and we shop on Sundays.", "pending"),
  c("A08", "aside", "hard", "Draft a message to the landlord about the leaking tap. Keep it polite but firm. English isn't his first language so simple words please.", "drop", { accept: ["pending"], note: "landlord's language, not user's — third party" }),
  c("A09", "aside", "hard", "I want to learn Rust over the next three months. I have about 5 hours a week, mostly weekends because weekdays are packed with calls. Build me a study plan.", "pending"),
  c("A10", "aside", "hard", "Compare these three phone plans for me. I barely make calls, it's all data and WhatsApp, and I travel to Singapore a couple of times a year.", "pending"),

  // 4. inferred-rule — preference implied by friction/complaint (expect pending)
  c("F01", "inferred-rule", "medium", "Again with the disclaimers. I know you're not a lawyer. Just tell me what the clause means.", "pending", { prev: "I'm not a lawyer, but here is a general overview. Please consult a legal professional..." }),
  c("F02", "inferred-rule", "medium", "Why is this in British spelling? Our docs are all US English.", "pending", { prev: "Here's the revised colour configuration and the optimised behaviour notes..." }),
  c("F03", "inferred-rule", "medium", "You used semicolons everywhere again, our lint config forbids them.", "pending", { prev: "const a = 1;\nconst b = 2;" }),
  c("F04", "inferred-rule", "hard", "I didn't ask for a summary at the end.", "pending", { prev: "(answer)... In summary, we covered three approaches..." }),
  c("F05", "inferred-rule", "hard", "Ugh, not another numbered list.", "pending", { prev: "1. First...\n2. Second...\n3. Third..." }),
  c("F06", "inferred-rule", "hard", "I had to reformat all the times to 24h before sending that out.", "pending"),
  c("F07", "inferred-rule", "hard", "Could you not open every reply with 'Great question'?", "pending", { accept: ["auto"], prev: "Great question! Here's how..." }),
  c("F08", "inferred-rule", "hard", "That's way more than I needed.", "pending", { accept: ["drop"], prev: "(a 1,200-word explanation of a one-line fix)", note: "could be one-off" }),
  c("F09", "inferred-rule", "hard", "You keep assuming I'm on Windows.", "pending", { prev: "Open PowerShell and run..." }),
  c("F10", "inferred-rule", "hard", "The last three plans you made had me working past 8pm. That's not happening.", "pending"),

  // 5. referential — meaning depends on previous assistant message
  c("P01", "referential", "medium", "yes, do that every time", "auto", { prev: "Want me to add type annotations to Python snippets by default?" }),
  c("P02", "referential", "medium", "sure", "drop", { prev: "Want me to also generate a test for this function?" }),
  c("P03", "referential", "medium", "please remember that", "auto", { prev: "Noted that you're flying out on the 14th and back on the 20th." , accept: ["pending"], note: "trip dates are temporary but user asked" }),
  c("P04", "referential", "hard", "yep, that's my usual", "pending", { prev: "So a flat white with oat milk?" }),
  c("P05", "referential", "hard", "no, the other one", "drop", { prev: "Did you mean the staging database or production?" }),
  c("P06", "referential", "hard", "perfect, that's exactly the tone I want from you", "pending", { accept: ["auto"], prev: "Short answer: no. The migration will lock the table. Run it at night." }),
  c("P07", "referential", "hard", "ok for now", "drop", { prev: "Should I keep using the mock API until the real one is ready?" }),
  c("P08", "referential", "hard", "correct, and that won't change", "pending", { accept: ["auto"], prev: "Just to confirm, you deploy only from the release branch, not main?" }),

  // 6. decision — user/team made a lasting choice (expect pending)
  c("D01", "decision", "easy", "We've standardised on pnpm across all repos.", "pending"),
  c("D02", "decision", "medium", "The team agreed: no more feature flags in the mobile app, we ship behind remote config.", "pending"),
  c("D03", "decision", "medium", "I've decided to stop freelancing on weekends.", "pending"),
  c("D04", "decision", "medium", "After the outage we moved all cron jobs to Temporal. Can you rewrite this job for it?", "pending"),
  c("D05", "decision", "hard", "Going with Tailwind for the new site, the designer gave up fighting it.", "pending"),
  c("D06", "decision", "hard", "Postgres it is. Can you draft the schema for the orders table?", "pending", { accept: ["drop"], note: "could be a one-project choice" }),

  // 7. marker-trap — memory words used for a one-off (expect drop)
  c("M01", "marker-trap", "easy", "Is it true that goldfish never forget anything?", "drop"),
  c("M02", "marker-trap", "easy", "Translate 'I will always remember you' into Japanese.", "drop"),
  c("M03", "marker-trap", "medium", "Why does my React effect always run twice in dev?", "drop"),
  c("M04", "marker-trap", "medium", "Write a regex that never matches empty strings.", "drop"),
  c("M05", "marker-trap", "medium", "Remember to check the last paragraph of the doc I sent — does it contradict the intro?", "drop"),
  c("M06", "marker-trap", "medium", "From now on in the story, the dragon should be friendly. Continue the chapter.", "drop", { note: "fiction instruction" }),
  c("M07", "marker-trap", "hard", "My tests pass locally but always fail in CI with a timeout. Here's the log.", "drop"),
  c("M08", "marker-trap", "hard", "Draft a company policy that says employees must always lock their screens.", "drop"),
  c("M09", "marker-trap", "hard", "What's a good way to remember the order of the planets?", "drop"),
  c("M10", "marker-trap", "hard", "Keep in mind the doc has two appendices when you summarise it.", "drop", { note: "memory phrase scoped to this task" }),

  // 8. research / topic interest (expect drop)
  c("R01", "research", "easy", "What are the pros and cons of solar panels for an apartment?", "drop"),
  c("R02", "research", "easy", "Best mechanical keyboards under 10k?", "drop"),
  c("R03", "research", "medium", "I've been reading a lot about stoicism lately. Which book should I start with?", "drop", { accept: ["pending"] }),
  c("R04", "research", "medium", "Explain the difference between an ETF and a mutual fund.", "drop"),
  c("R05", "research", "medium", "What's the history of the Kolkata tram system?", "drop"),
  c("R06", "research", "medium", "Compare Supabase and Firebase for a small side project.", "drop"),
  c("R07", "research", "hard", "I'm curious about bouldering, is it bad for your fingers long term?", "drop", { accept: ["pending"] }),
  c("R08", "research", "hard", "Find me 5 papers on retrieval-augmented generation from 2025.", "drop"),

  // 9. temporary / session-scoped (expect drop)
  c("T01", "temporary", "easy", "For this chat, pretend you're a pirate.", "drop"),
  c("T02", "temporary", "easy", "I'm in a meeting, answer in one line for now.", "drop"),
  c("T03", "temporary", "medium", "This week I'm on call, so keep reminders about the incident channel handy.", "drop"),
  c("T04", "temporary", "medium", "I have a cold today, suggest something easy for lunch.", "drop"),
  c("T05", "temporary", "medium", "Until the demo on Friday, prioritise the checkout flow over everything.", "drop", { accept: ["pending"] }),
  c("T06", "temporary", "hard", "I'm using my work laptop today, so no personal account links please.", "drop"),
  c("T07", "temporary", "hard", "Right now I only care about the numbers, skip the explanation.", "drop"),
  c("T08", "temporary", "hard", "Just for this answer, use Python instead of TypeScript.", "drop", { note: "implies TS is the default — but ask is one-off" }),

  // 10. quoted / third-party / hypothetical (expect drop)
  c("Q01", "quoted", "medium", "My colleague always writes 'per my last email'. Is that passive aggressive?", "drop"),
  c("Q02", "quoted", "medium", "Rewrite this support macro: 'We always respond within 24 hours and never share your data.'", "drop"),
  c("Q03", "quoted", "hard", "My mom prefers phone calls to texts. Help me write her a voicemail script for her birthday.", "drop"),
  c("Q04", "quoted", "hard", "Here's our style guide excerpt: 'Always use sentence case for headings. Never use exclamation marks.' Does my draft follow it?", "drop", { accept: ["pending"], note: "their team's guide — arguably durable" }),
  c("Q05", "quoted", "hard", "If I were vegetarian, what protein sources would you suggest?", "drop"),
  c("Q06", "quoted", "hard", "The client said: 'please remember we never work on Fridays'. Draft a reply acknowledging it.", "drop"),
  c("Q07", "quoted", "hard", "Hypothetically, if I told you to always answer in French, how would that work?", "drop"),
  c("Q08", "quoted", "medium", "My boss hates bullet points. Can you turn this list into a paragraph for him?", "drop", { accept: ["pending"] }),
  c("Q09", "quoted", "hard", "A user on our forum wrote 'I always get logged out after 5 minutes'. What could cause that?", "drop"),
  c("Q10", "quoted", "hard", "Pretend I'm a customer who never reads emails. How would you get my attention?", "drop"),

  // 11. meta / memory ops (expect drop — not new lessons)
  c("E01", "meta", "easy", "What do you know about me so far?", "drop"),
  c("E02", "meta", "medium", "Delete the thing you saved about my coffee.", "drop"),
  c("E03", "meta", "medium", "Do you actually remember past conversations?", "drop"),
  c("E04", "meta", "hard", "You can stop assuming I'm vegan, that was a month-long experiment.", "drop", { accept: ["pending"], note: "correction to memory; arguably a new fact" }),

  // 12. noisy — typos, Hinglish, code-mixed, very long
  c("N01", "noisy", "medium", "bro stop giving me 10 options, 2-3 max ok", "pending", { accept: ["auto"] }),
  c("N02", "noisy", "medium", "mujhe spicy khana pasand nahi, kuch mild batao dinner ke liye", "pending", { note: "Hindi: I don't like spicy food, suggest something mild for dinner" }),
  c("N03", "noisy", "hard", "rmbr i use vim keybinds everywhere so dont tell me to click stuff", "auto", { accept: ["pending"] }),
  c("N04", "noisy", "hard", "```\n# TODO: always use UTC here\nts = datetime.now()\n```\nwhy is this off by 5.5 hours", "drop"),
  c("N05", "noisy", "hard", "ok so long story but basically the vendor changed their API again, which is the third time this quarter, and our integration broke over the weekend, I spent all Sunday on it and I'm exhausted, anyway can you look at this error and tell me what changed in their response format", "drop"),
  c("N06", "noisy", "hard", "thx. btw im always on mobile so short answrs pls", "pending", { accept: ["auto"] }),
];
