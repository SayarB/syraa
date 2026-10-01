// Run lesson-gate cases through Jev. Usage: bun run.ts  (reads TYPESAFE_API_KEY from repo .env)
import { cases, type Band, type Case } from "./cases.ts";

const KEY = process.env.TYPESAFE_API_KEY;
if (!KEY) throw new Error("TYPESAFE_API_KEY missing");
const ENDPOINT = "https://api.typesafe.ai/v1/systemone";

const AUTO = Number(process.env.AUTO ?? 0.85);
const PENDING = Number(process.env.PENDING ?? 0.5);

const QUESTIONS = {
  durable: {
    type: "noul",
    instructions:
      "Is the user teaching the assistant something to remember for FUTURE conversations — a lasting fact about themselves, a standing preference, a rule, a working method, or a decision they made? Asking a question, requesting a one-off task, showing interest in a topic, quoting text, or setting something for this conversation only does not count.",
    criteria: {
      true: "The user states or confirms something durable the assistant should remember and apply in later conversations.",
      false: "The message is a one-off request, question, research ask, quote, temporary/session-only instruction, or a request about memory itself.",
    },
  },
  explicitness: {
    type: "choice",
    instructions: "How explicitly does the user ask the assistant to remember or always apply this?",
    criteria: {
      explicit: "Clear standing instruction: remember, from now on, always, never, going forward, every time (or equivalent in any language), or a clear yes to the assistant offering to do so going forward.",
      implicit: "A preference or fact is stated but the user does not ask for it to be remembered or applied going forward.",
      none: "Nothing durable is being taught.",
    },
  },
  kind: {
    type: "choice",
    instructions: "If the user teaches something durable, what kind is it?",
    criteria: {
      preference: "How the user likes things: style, format, language, tastes, personal facts.",
      rule: "A hard trigger/response or must/never constraint on the assistant's behavior.",
      method: "A way of working or process to follow on certain tasks.",
      decision: "A choice the user or their team has made (tech, product, plan).",
      none: "Nothing durable is being taught.",
    },
  },
  self_contained: {
    type: "noul",
    instructions:
      "Could the user's message, stored word for word, serve as a clean memory note on its own — understandable without the previous assistant message and without including an unrelated one-off task?",
    criteria: {
      true: "The message alone reads as a clean, standalone memory note.",
      false: "It depends on the previous assistant message, or mixes in a one-off task or other content that should not be stored.",
    },
  },
} as const;

const SENTENCE_Q = {
  durable: {
    type: "noul",
    instructions: QUESTIONS.durable.instructions,
    criteria: QUESTIONS.durable.criteria,
  },
};

// Mirrors packages/harness/src/lessons.ts regex (baseline only).
const EXPLICIT_MARKERS = /\b(always|never|every time|from now on|remember that|remember to|don't ever|do not ever)\b/i;
const EXPLICIT_MEMORY_INTENT = /\b(remember that|remember to|from now on|save (?:this|that|as)|add (?:this|that) to memory)\b/i;
const ONE_OFF_TASK_QUERY = /\b(research|recommend(?:ation)?s?|what should i (?:buy|get)|help me (?:choose|pick|find|decide)|compare|options for|best .+ (?:for|under)|under \d+\s*(?:l|lac|lakh|k|cr))\b/i;
function regexBaseline(user: string): "auto" | "drop" | "llm-decides" {
  if (EXPLICIT_MEMORY_INTENT.test(user) || EXPLICIT_MARKERS.test(user)) return "auto";
  if (ONE_OFF_TASK_QUERY.test(user)) return "drop";
  return "llm-decides";
}

function state(c: Case): string {
  return [
    `Previous assistant message: ${c.prev ?? "(none — start of conversation)"}`,
    `User message: ${c.user}`,
  ].join("\n");
}

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
  return { answers: body.answers, model: body.model as string, usage: body.usage, ms };
}

function band(p: number, explicitness: string): Band {
  if (p >= AUTO && explicitness === "explicit") return "auto";
  if (p >= PENDING) return "pending";
  return "drop";
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\s+—\s+|,\s+(?:and\s+)?(?:btw|also|anyway)\b/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);
}

const results: any[] = [];
for (const c of cases) {
  const [r1, r2] = await Promise.all([jev(state(c), QUESTIONS), jev(state(c), QUESTIONS)]);
  const a = r1.answers;
  const p = a.durable.noul as number;
  const b = band(p, a.explicitness.choice);
  const perSentence =
    c.selfContained === false || sentences(c.user).length > 1
      ? await Promise.all(
          sentences(c.user).map(async (s) => ({
            s,
            p: (await jev(`Previous assistant message: ${c.prev ?? "(none)"}\nUser message: ${s}`, SENTENCE_Q)).answers.durable.noul as number,
          })),
        )
      : [];
  results.push({
    ...c,
    p,
    p2: r2.answers.durable.noul,
    explicitness: a.explicitness,
    kindAns: a.kind,
    selfP: a.self_contained.noul,
    band: b,
    pass: c.accept.includes(b),
    regex: regexBaseline(c.user),
    perSentence,
    ms: r1.ms,
    model: r1.model,
    tokens: r1.usage,
  });
  process.stderr.write(`${c.id} p=${p.toFixed(2)} ${b} ${c.accept.includes(b) ? "ok" : "MISS"}\n`);
}

await Bun.write(new URL("./results.json", import.meta.url).pathname, JSON.stringify({ AUTO, PENDING, results }, null, 2));
