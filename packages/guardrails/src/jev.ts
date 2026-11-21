/**
 * Jev (TypeSafe System One) client. A classifier that answers yes/no-score (`noul`, 0..1) and
 * `choice` questions about a piece of text. Used by the lesson gate and by guards.
 *
 * The core never imports Mastra: tracing is an injected hook (`JevTrace`) the caller implements.
 */

const JEV_URL = "https://api.typesafe.ai/v1/systemone";
export const JEV_MODEL = "jev-latest";
export const JEV_TIMEOUT_MS = 3000;

export type QuestionSet = Record<string, { type: "noul" | "choice" }>;

export type JevAnswers<Q extends QuestionSet> = {
  [K in keyof Q]: Q[K]["type"] extends "noul" ? number : string;
};

export type JevUsage = { input_tokens?: number; output_tokens?: number };

export type JevTraceSpan = {
  end(result: { answers: Record<string, number | string>; model: string; usage?: JevUsage }): void;
  fail(error: unknown): void;
};

/** Implemented by the caller (e.g. as a Langfuse span); one `start` per Jev call. */
export type JevTrace = {
  start(call: { state: string; questions: QuestionSet }): JevTraceSpan;
};

/** True when a Jev key is configured. Guards and the lesson gate are off without one. */
export function isJevConfigured(): boolean {
  return Boolean(process.env.TYPESAFE_API_KEY?.trim());
}

/** One Jev evaluation. Throws on missing key, HTTP error, timeout, or a malformed answer. */
export async function askJev<Q extends QuestionSet>(
  state: string,
  questions: Q,
  opts: { trace?: JevTrace; timeoutMs?: number } = {},
): Promise<JevAnswers<Q>> {
  const span = opts.trace?.start({ state, questions });
  try {
    const { answers, model, usage } = await callJev(state, questions, opts.timeoutMs);
    span?.end({ answers, model, usage });
    return answers;
  } catch (error) {
    span?.fail(error);
    throw error;
  }
}

export async function callJev<Q extends QuestionSet>(
  state: string,
  questions: Q,
  timeoutMs: number = JEV_TIMEOUT_MS,
) {
  const key = process.env.TYPESAFE_API_KEY?.trim();
  if (!key) throw new Error("TYPESAFE_API_KEY not set");

  const res = await fetch(JEV_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: JEV_MODEL, state, questions }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`jev HTTP ${res.status}`);

  const body = (await res.json()) as {
    answers?: Record<string, { noul?: unknown; choice?: unknown }>;
    model?: string;
    usage?: JevUsage;
  };
  const answers: Record<string, number | string> = {};
  for (const [name, question] of Object.entries(questions)) {
    const answer = body.answers?.[name];
    const value = question.type === "noul" ? answer?.noul : answer?.choice;
    const valid = question.type === "noul" ? typeof value === "number" : typeof value === "string";
    if (!valid) throw new Error(`jev answer missing: ${name}`);
    answers[name] = value as number | string;
  }
  return {
    answers: answers as JevAnswers<Q>,
    model: body.model ?? JEV_MODEL,
    usage: body.usage,
  };
}
