// Lesson-gate eval cases. `accept` = bands we'd count as correct.
// auto = save + activate, pending = HITL card, drop = nothing saved.
export type Band = "auto" | "pending" | "drop";
export type Kind = "preference" | "rule" | "method" | "decision" | "none";

export type Case = {
  id: string;
  group: string;
  prev?: string;
  user: string;
  accept: Band[];
  kind?: Kind;
  selfContained?: boolean;
  note?: string;
};

export const cases: Case[] = [
  // A. Explicit durable — the easy baseline
  { id: "A1", group: "explicit", user: "From now on, answer in bullet points.", accept: ["auto"], kind: "preference", selfContained: true },
  { id: "A2", group: "explicit", user: "Remember that I'm vegetarian.", accept: ["auto"], kind: "preference", selfContained: true },
  { id: "A3", group: "explicit", user: "Never use emojis in your replies to me.", accept: ["auto"], kind: "rule", selfContained: true },
  { id: "A4", group: "explicit", user: "When I say 'tldr', give me exactly 3 bullets and nothing else.", accept: ["auto"], kind: "rule", selfContained: true },

  // B. Implicit durable — no magic words (regex misses these)
  { id: "B1", group: "implicit", user: "I prefer dark mode screenshots in any docs you draft.", accept: ["pending", "auto"], kind: "preference", selfContained: true },
  { id: "B2", group: "implicit", user: "fyi I'm on a Mac, so skip the Windows instructions.", accept: ["pending", "auto"], kind: "preference", selfContained: false, note: "durable fact + one-off instruction" },
  { id: "B3", group: "implicit", user: "I really can't stand long intros. Get to the point.", accept: ["pending", "auto"], kind: "preference", selfContained: true },
  { id: "B4", group: "implicit", user: "We decided to go with Postgres over Mongo for Syraa's storage.", accept: ["pending", "auto"], kind: "decision", selfContained: true },
  { id: "B5", group: "implicit", user: "When we debug together, check the logs first before proposing code changes.", accept: ["pending", "auto"], kind: "method", selfContained: true },

  // C. Marker traps — "always/never/remember" inside a one-off ask
  { id: "C1", group: "marker-trap", user: "Which airline always has the cheapest Delhi–Goa flights?", accept: ["drop"], kind: "none" },
  { id: "C2", group: "marker-trap", user: "Find me laptops under 80k that never overheat.", accept: ["drop"], kind: "none" },
  { id: "C3", group: "marker-trap", user: "Remember that movie with the spinning top at the end? What was it called?", accept: ["drop"], kind: "none" },
  { id: "C4", group: "marker-trap", user: "Write a short poem that starts with 'From now on I will always love you'.", accept: ["drop"], kind: "none" },
  { id: "C5", group: "marker-trap", user: "What does 'from now on' mean legally in a contract clause?", accept: ["drop"], kind: "none" },
  { id: "C6", group: "marker-trap", user: "Fix this bug:\n```ts\n// always validate input\nfunction add(a, b) { return a - b }\n```", accept: ["drop"], kind: "none" },

  // D. Topic interest / research — must not become memory
  { id: "D1", group: "research", user: "Compare the best EVs under 20 lakh for city driving.", accept: ["drop"], kind: "none" },
  { id: "D2", group: "research", user: "Help me pick running shoes for flat feet.", accept: ["drop"], kind: "none" },
  { id: "D3", group: "research", user: "I'm really into Japanese woodworking lately — what are good beginner chisels?", accept: ["drop", "pending"], kind: "none", note: "interest stated, but ask is one-off; pending tolerable" },

  // E. Referential — meaning lives in the previous assistant message
  { id: "E1", group: "referential", prev: "Want me to keep answers under 100 words going forward?", user: "yes please", accept: ["auto", "pending"], kind: "preference", selfContained: false },
  { id: "E2", group: "referential", prev: "Should I format this comparison as a table?", user: "yes", accept: ["drop"], kind: "none", note: "one-off yes" },
  { id: "E3", group: "referential", prev: "Here's the summary in Hindi as you asked. Should I keep replying in Hindi?", user: "haan, hamesha", accept: ["auto", "pending"], kind: "preference", selfContained: false },
  { id: "E4", group: "referential", prev: "I wrote the tests with Jest. Want me to switch to Vitest?", user: "yeah, and do that for every repo of mine", accept: ["auto", "pending"], kind: "preference", selfContained: false },

  // F. Mixed — durable fact + one-off task in one message
  { id: "F1", group: "mixed", user: "Remember I'm vegetarian — also find me a place for dinner tonight in Indiranagar.", accept: ["auto", "pending"], kind: "preference", selfContained: false },
  { id: "F2", group: "mixed", user: "Book-wise I'm done with thrillers, never recommend them again. Anyway, what's the capital of Peru?", accept: ["auto", "pending"], kind: "preference", selfContained: false },

  // G. Temporary / session-scoped — not durable
  { id: "G1", group: "temporary", user: "For this conversation only, reply in Spanish.", accept: ["drop"], kind: "none" },
  { id: "G2", group: "temporary", user: "Today I'm working from Pune, so use IST for the meeting times.", accept: ["drop"], kind: "none" },
  { id: "G3", group: "temporary", user: "Just this once, give me the long version.", accept: ["drop"], kind: "none" },

  // H. Retraction / meta / negated memory
  { id: "H1", group: "meta", user: "Forget what I said about bullet points.", accept: ["drop"], kind: "none", note: "memory op, not a new lesson" },
  { id: "H2", group: "meta", user: "Don't remember this, but I'm really stressed today.", accept: ["drop"], kind: "none" },
  { id: "H3", group: "meta", user: "What do you remember about me?", accept: ["drop"], kind: "none" },
  { id: "H4", group: "meta", user: "If I told you 'always use tabs', would you actually remember it?", accept: ["drop"], kind: "none" },

  // I. Third party / hypothetical
  { id: "I1", group: "third-party", user: "My boss always wants reports as PDFs, can you convert this one?", accept: ["pending", "drop"], kind: "preference", note: "arguably durable context about user's work" },
  { id: "I2", group: "third-party", user: "My friend never eats pork. Suggest a menu for her birthday dinner.", accept: ["drop"], kind: "none" },

  // J. Noisy input — typos, Hinglish, sarcasm, buried
  { id: "J1", group: "noisy", user: "pls dnt use emojis evr again", accept: ["auto", "pending"], kind: "rule", selfContained: true },
  { id: "J2", group: "noisy", user: "yaar hamesha hindi me reply karna", accept: ["auto", "pending"], kind: "preference", selfContained: true },
  { id: "J3", group: "noisy", prev: "(a 1,800-word answer)", user: "oh great, another essay. love that for me.", accept: ["pending", "drop"], kind: "preference", note: "sarcastic implicit pref for brevity" },
  { id: "J4", group: "noisy", user: "ok so I need to plan the offsite for 40 people in Nov, budget is around 6L, somewhere 3-4h from Bangalore, and btw going forward always give me costs in INR not USD, and make sure there's a vegetarian-friendly venue option.", accept: ["auto", "pending"], kind: "preference", selfContained: false, note: "durable pref buried in long task" },
];
