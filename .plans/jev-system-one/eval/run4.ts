// Round 3 held-out run. Questions + band rule frozen from round 2 (strict, reveals v2, explicitness).
// One Jev call per case with all three questions — the shape we'd ship. Usage: bun run3.ts
import { cases4 as cases3 } from "./cases4.ts";

const KEY = process.env.TYPESAFE_API_KEY;
if (!KEY) throw new Error("TYPESAFE_API_KEY missing");
const ENDPOINT = "https://api.typesafe.ai/v1/systemone";

const QUESTIONS = {
  strict: {
    type: "noul",
    instructions:
      "Is the user teaching the assistant something to remember for FUTURE conversations — a lasting fact about themselves, a standing preference, a rule, a working method, or a decision they made? Asking a question, requesting a one-off task, showing interest in a topic, quoting text, or setting something for this conversation only does not count.",
    criteria: {
      true: "The user states or confirms something durable the assistant should remember and apply in later conversations.",
      false: "The message is a one-off request, question, research ask, quote, temporary/session-only instruction, or a request about memory itself.",
    },
  },
  reveals: {
    type: "noul",
    instructions:
      "Setting the main request aside: does the message reveal, even in passing, something lasting that should carry over to future, unrelated conversations — a fact about the user, a standing preference about how they want the assistant to work (including one implied by a complaint or repeated correction), or a decision the user or their team has made about their tools, stack, or way of working? Facts only about this one task, temporary situations, other people's preferences, hypotheticals, or quoted text from someone else do not count.",
    criteria: {
      true: "Something lasting about the user, how they want help, or a decision they or their team made, that should carry over to future conversations.",
      false: "Everything is specific to this task, temporary, hypothetical, about someone else, or quoted.",
    },
  },
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

// Frozen rule (round 2): auto = strict≥0.65 ∧ explicit ∧ reveals≥0.5; pending = (strict≥0.5 ∧ reveals≥0.5) ∨ reveals≥0.6
export function band(strict: number, reveals: number, explicit: string) {
  if (strict >= 0.65 && explicit === "explicit" && reveals >= 0.5) return "auto" as const;
  if ((strict >= 0.5 && reveals >= 0.5) || reveals >= 0.6) return "pending" as const;
  return "drop" as const;
}

async function jev(state: string) {
  for (let attempt = 0; ; attempt++) {
    const t0 = performance.now();
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "jev-latest", state, questions: QUESTIONS }),
    });
    const ms = Math.round(performance.now() - t0);
    const body = (await res.json()) as any;
    if (res.ok) return { answers: body.answers, usage: body.usage, model: body.model, ms };
    if (attempt < 3 && (res.status === 429 || res.status >= 500)) { await Bun.sleep(1000 * (attempt + 1)); continue; }
    throw new Error(`${res.status} ${JSON.stringify(body)}`);
  }
}

const results: any[] = [];
const queue = [...cases3];
await Promise.all(
  Array.from({ length: 6 }, async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      const state = `Previous assistant message: ${c.prev ?? "(none — start of conversation)"}\nUser message: ${c.user}`;
      const r = await jev(state);
      const strict = r.answers.strict.noul as number;
      const reveals = r.answers.reveals.noul as number;
      const explicit = r.answers.explicitness.choice as string;
      const got = band(strict, reveals, explicit);
      results.push({ ...c, strict, reveals, explicit, explicitConf: r.answers.explicitness.confidence, got, ms: r.ms, tokens: r.usage, model: r.model });
      process.stderr.write(`${c.id} ${got}${got === c.expect ? "" : ` (exp ${c.expect})`}\n`);
    }
  }),
);
results.sort((a, b) => cases3.findIndex((c) => c.id === a.id) - cases3.findIndex((c) => c.id === b.id));
await Bun.write(new URL("./results4.json", import.meta.url).pathname, JSON.stringify({ results }, null, 2));
