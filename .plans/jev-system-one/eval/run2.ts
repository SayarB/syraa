// Round 2 runner. Usage: bun run2.ts (needs TYPESAFE_API_KEY).
// Compares the round-1 "teaching" question (strict) with a looser "reveals something durable" question,
// and checks whether per-sentence scoring finds the planted aside.
import { cases2 } from "./cases2.ts";

const KEY = process.env.TYPESAFE_API_KEY;
if (!KEY) throw new Error("TYPESAFE_API_KEY missing");
const ENDPOINT = "https://api.typesafe.ai/v1/systemone";

const STRICT = {
  type: "noul",
  instructions:
    "Is the user teaching the assistant something to remember for FUTURE conversations — a lasting fact about themselves, a standing preference, a rule, a working method, or a decision they made? Asking a question, requesting a one-off task, showing interest in a topic, quoting text, or setting something for this conversation only does not count.",
  criteria: {
    true: "The user states or confirms something durable the assistant should remember and apply in later conversations.",
    false: "The message is a one-off request, question, research ask, quote, temporary/session-only instruction, or a request about memory itself.",
  },
};

const REVEALS = {
  type: "noul",
  instructions:
    "Setting the main request aside: does the message reveal, even in passing, a lasting fact about the user or a standing preference about how they want the assistant to work — something that would still be true and useful in a future, unrelated conversation? Also count preferences implied by complaints or repeated corrections. Facts only about this one task, temporary situations, other people's preferences, or quoted text do not count.",
  criteria: {
    true: "The message reveals something lasting about the user or how they want help, that should carry over to future conversations.",
    false: "Everything in the message is specific to this task, temporary, about someone else, or quoted.",
  },
};

const QUESTIONS = {
  strict: STRICT,
  reveals: REVEALS,
  explicitness: {
    type: "choice",
    instructions: "How explicitly does the user ask the assistant to remember or always apply this?",
    criteria: {
      explicit: "Clear standing instruction: remember, from now on, always, never, going forward, every time (or equivalent in any language), or a clear yes to the assistant offering to do so going forward.",
      implicit: "A preference or fact is stated or implied but the user does not ask for it to be remembered or applied going forward.",
      none: "Nothing durable is being taught.",
    },
  },
};

async function jev(state: string, questions: object) {
  const t0 = performance.now();
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "jev-latest", state, questions }),
  });
  const ms = Math.round(performance.now() - t0);
  const body = (await res.json()) as any;
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body)}`);
  return { answers: body.answers, ms, usage: body.usage };
}

const sentences = (t: string) =>
  t.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 3);

const stateFor = (prev: string | undefined, user: string) =>
  `Previous assistant message: ${prev ?? "(none — start of conversation)"}\nUser message: ${user}`;

const results: any[] = [];
for (const c of cases2) {
  const turn = await jev(stateFor(c.prev, c.user), QUESTIONS);
  const perSentence = await Promise.all(
    sentences(c.user).map(async (s) => ({
      s,
      p: (await jev(stateFor(c.prev, s), { reveals: REVEALS })).answers.reveals.noul as number,
    })),
  );
  const top = [...perSentence].sort((a, b) => b.p - a.p)[0];
  results.push({
    ...c,
    strict: turn.answers.strict.noul,
    reveals: turn.answers.reveals.noul,
    explicitness: turn.answers.explicitness,
    perSentence,
    topSentence: top?.s,
    topHitsPlant: c.plant ? Boolean(top?.s.includes(c.plant)) : null,
    ms: turn.ms,
    tokens: turn.usage,
  });
  process.stderr.write(
    `${c.id.padEnd(4)} strict=${turn.answers.strict.noul.toFixed(2)} reveals=${turn.answers.reveals.noul.toFixed(2)} ${turn.answers.explicitness.choice.padEnd(8)} span=${c.plant ? (top?.s.includes(c.plant) ? "hit" : "MISS") : "-"}\n`,
  );
}

await Bun.write(new URL("./results2.json", import.meta.url).pathname, JSON.stringify({ results }, null, 2));
