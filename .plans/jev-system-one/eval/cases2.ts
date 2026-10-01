// Round 2: longer messages, durable signal only as a passing aside (no memory markers),
// implicit rules that must be inferred, and long personal-sounding controls with nothing durable.
// `plant` = substring of the sentence that carries the durable signal (for span checks).
import type { Band, Kind } from "./cases.ts";

export type Case2 = {
  id: string;
  group: "aside" | "inferred-rule" | "control";
  prev?: string;
  user: string;
  accept: Band[];
  kind?: Kind;
  plant?: string;
  note?: string;
};

export const cases2: Case2[] = [
  // ── Asides: a durable fact/preference dropped in passing inside a bigger ask ──
  { id: "S1", group: "aside", kind: "preference", accept: ["pending", "auto"], plant: "I usually end up in the hills",
    user: "Planning a long weekend in late October, probably Thursday to Sunday. Budget is flexible but I don't want to spend more than half a day travelling each way. I usually end up in the hills anyway, beaches just aren't my thing. Can you suggest three options from Bangalore with a rough plan for each?" },
  { id: "S2", group: "aside", kind: "preference", accept: ["pending", "auto"], plant: "I read everything on my phone",
    user: "Can you draft a one-page summary of the Q3 infra costs from the notes I pasted earlier? Keep the tables narrow, I read everything on my phone during the commute. Highlight anything that went up more than 20% month on month." },
  { id: "S3", group: "aside", kind: "preference", accept: ["pending", "auto"], plant: "I'm lactose intolerant",
    user: "Need a quick dinner idea for tonight, something under 30 minutes. I've got chicken thighs, spinach, some rice and the usual spices. I'm lactose intolerant so the creamy stuff is out. Nothing too fancy." },
  { id: "S4", group: "aside", kind: "preference", accept: ["pending", "auto"], plant: "I think in TypeScript",
    user: "I'm trying to understand how rate limiting with a token bucket actually works under concurrency. Could you walk me through it with a small example? I think in TypeScript, Python examples take me twice as long to follow. Also mention what breaks when you run multiple instances." },
  { id: "S5", group: "aside", kind: "preference", accept: ["pending", "auto"], plant: "I'm a morning person",
    user: "Help me restructure my week. I have about 12 hours of deep work to fit in around standups at 10 and a lot of meetings on Tuesday and Thursday. I'm a morning person, my brain is mush after 4pm. Give me a simple block schedule." },
  { id: "S6", group: "aside", kind: "decision", accept: ["pending", "auto"], plant: "we moved everything to Bun",
    user: "The CI job for the web app is taking almost 9 minutes and I want it under 4. It installs deps, typechecks, runs unit tests and builds. Since we moved everything to Bun last month the install step is fast, so it's mostly the tests and the build. What would you cut or parallelise first?" },
  { id: "S7", group: "aside", kind: "preference", accept: ["pending", "auto"], plant: "I'm based in Kolkata",
    user: "Can you look at this flight search and tell me whether the 6am or the 11pm option makes more sense for a Delhi meeting at 2pm? I'm based in Kolkata so either way it's a short hop. I don't mind early starts but I hate red-eyes." },
  { id: "S8", group: "aside", kind: "preference", accept: ["pending", "auto"], plant: "spoilers ruin it for me",
    user: "I just finished the second season of Severance and loved it. What should I watch next that has a similar slow-burn mystery vibe? Please keep the descriptions vague, spoilers ruin it for me even small ones." },
  { id: "S9", group: "aside", kind: "method", accept: ["pending", "auto"], plant: "I like seeing the failing test first",
    user: "The date parser returns the wrong day for timestamps near midnight in IST. Before you jump to a fix, I like seeing the failing test first, then the change. Here's the function and two example inputs that break it." },
  { id: "S10", group: "aside", kind: "preference", accept: ["pending", "auto"], plant: "I go to Goa every December",
    user: "Thinking about which credit card to get for travel. I spend maybe 2 lakh a year on flights and hotels, mostly domestic. I go to Goa every December with the same group of friends, so hotel points would actually get used. Which cards should I look at?" },
  { id: "S11", group: "aside", kind: "preference", accept: ["pending", "auto"], plant: "I'm colour-blind",
    user: "Can you pick a colour palette for the dashboard charts? Five categories, needs to work on a dark background. Worth knowing I'm colour-blind, red-green specifically, so I've been burned by default palettes before." },
  { id: "S12", group: "aside", kind: "preference", accept: ["pending", "auto"], plant: "my Hindi is much better than my Bengali",
    user: "My grandmother sent a voice note that I transcribed below and I can only half understand it. Can you translate it to English and explain any idioms? Honestly my Hindi is much better than my Bengali these days, which is a bit embarrassing." },

  // ── Inferred rules: nobody says "always/never", the rule has to be read from friction ──
  { id: "R1", group: "inferred-rule", kind: "preference", accept: ["pending"], plant: "strip out all the emojis",
    user: "Thanks, that works. Had to strip out all the emojis again before pasting it into the client email though. Can you now do the same summary for the October report?" },
  { id: "R2", group: "inferred-rule", kind: "preference", accept: ["pending"], plant: "third time",
    prev: "(a detailed answer that opens with a 4-paragraph background section)",
    user: "This is the third time I've had to scroll past a history lesson to get to the answer. Anyway, what's the actual command to rotate the key?" },
  { id: "R3", group: "inferred-rule", kind: "method", accept: ["pending"], plant: "keep converting",
    prev: "Here's the snippet using Python's requests library: ...",
    user: "I keep converting these back to fetch myself. The rest of the codebase is TypeScript. Can you redo it?" },
  { id: "R4", group: "inferred-rule", kind: "preference", accept: ["pending"], plant: "in rupees",
    prev: "The plan costs about $49/month, or roughly $490/year billed annually.",
    user: "ok and in rupees? I had to convert the last three quotes too" },
  { id: "R5", group: "inferred-rule", kind: "rule", accept: ["pending"], plant: "without asking me",
    prev: "Done — I've renamed the files and pushed the commit to main.",
    user: "Please don't do that without asking me. I review everything before it goes to main. Can you revert the push?" },
  { id: "R6", group: "inferred-rule", kind: "preference", accept: ["pending"], plant: "shorter",
    prev: "(a 1,500-word answer)",
    user: "shorter" , note: "single-word correction — ambiguous, could be one-off" },

  // ── Controls: long and personal-sounding, but nothing durable to remember ──
  { id: "N1", group: "control", accept: ["drop"],
    user: "I'm at the airport right now and my flight got delayed by three hours, which is annoying because I had a dinner planned. Can you find me a decent place to eat in Terminal 2 that's open late and not a food court?" },
  { id: "N2", group: "control", accept: ["drop"],
    user: "My sister is visiting next week and she loves hiking, so I want to plan something for Saturday. She's pretty fit, I'm less so. Any trails within 2 hours of Bangalore that work for mixed fitness levels?" },
  { id: "N3", group: "control", accept: ["drop"],
    user: "I've been feeling pretty tired this week, probably because of the release crunch. Anyway, can you help me write a short update to the team saying the launch is moving by two days and why?" },
  { id: "N4", group: "control", accept: ["drop"],
    user: "I'm reading a book right now where the main character always takes the stairs and never uses lifts, it's a weird running joke. Can you tell me if that's a reference to something? The book is from the 90s." },
  { id: "N5", group: "control", accept: ["drop"],
    user: "For this deck specifically I want it minimal, black and white, no stock photos. It's for a very conservative banking client. Can you outline 10 slides for the pitch?" },
  { id: "N6", group: "control", accept: ["drop", "pending"], note: "current-state fact, might be worth remembering short-term",
    user: "I'm moving flats next month so things are chaotic. Can you make me a checklist for the move, things like address changes, internet transfer, and so on?" },
  { id: "N7", group: "control", accept: ["drop"],
    user: "Here's the customer's email: 'We always prefer invoices in PDF and never accept Excel files. Please remember this for future billing.' Can you draft a polite reply confirming?" },
  { id: "N8", group: "control", accept: ["drop"],
    user: "I tried the recipe you gave me yesterday and it came out great, my flatmates finished everything. Can you give me a dessert that would go with it for this weekend?" },
];
