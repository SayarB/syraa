import { getLessonWriterAgent } from "./mastra/index.js";
import type { LessonKind } from "./schemas.js";
import { lastAssistantMessageText } from "./threads.js";

/**
 * Lesson gate: Jev (TypeSafe System One) decides whether a user turn teaches something
 * durable, and whether it auto-activates or needs HITL confirmation.
 * Questions and band rule are frozen from the eval in `.plans/jev-system-one/` —
 * re-run `npm run eval:lesson-gate` after changing any wording or threshold.
 */

const JEV_URL = "https://api.typesafe.ai/v1/systemone";
const JEV_TIMEOUT_MS = 3000;
const WRITER_TIMEOUT_MS = 5000;
const GATED_KINDS: readonly GatedLesson["kind"][] = ["preference", "rule", "method", "decision"];
const MAX_SCORED_SENTENCES = 12;
const VERBATIM_MIN = 0.85;
const MAX_LESSON_CHARS = 240;

export type LessonBand = "auto" | "pending" | "drop";

export type LessonGateScores = {
  strict: number;
  reveals: number;
  explicitness: string;
};

export type GatedLesson = {
  text: string;
  kind: Exclude<LessonKind, "suggestion">;
  activate: boolean;
  confidence: "high" | "medium" | "low";
};

export const LESSON_GATE_QUESTIONS = {
  strict: {
    type: "noul",
    instructions:
      "Is the user teaching the assistant something to remember for FUTURE conversations — a lasting fact about themselves, a standing preference, a rule, a working method, or a decision they made? Asking a question, requesting a one-off task, showing interest in a topic, quoting text, or setting something for this conversation only does not count.",
    criteria: {
      true: "The user states or confirms something durable the assistant should remember and apply in later conversations.",
      false:
        "The message is a one-off request, question, research ask, quote, temporary/session-only instruction, or a request about memory itself.",
    },
  },
  reveals: {
    type: "noul",
    instructions:
      "Setting the main request aside: does the message reveal, even in passing, something lasting that should carry over to future, unrelated conversations — a fact about the user, a standing preference about how they want the assistant to work (including one implied by a complaint or repeated correction), or a decision the user or their team has made about their tools, stack, or way of working? Facts only about this one task, temporary situations, other people's preferences, hypotheticals, or quoted text from someone else do not count.",
    criteria: {
      true: "Something lasting about the user, how they want help, or a decision they or their team made, that should carry over to future conversations.",
      false:
        "Everything is specific to this task, temporary, hypothetical, about someone else, or quoted.",
    },
  },
  explicitness: {
    type: "choice",
    instructions:
      "How explicitly does the user ask the assistant to remember or always apply this?",
    criteria: {
      explicit:
        "Clear standing instruction: remember, from now on, always, never, going forward, every time (or equivalent in any language), or a clear yes to the assistant offering to do so going forward.",
      implicit:
        "A preference or fact is stated or implied but the user does not ask for it to be remembered or applied going forward.",
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
      false:
        "It depends on the previous assistant message, or mixes in a one-off task or other content that should not be stored.",
    },
  },
} as const;

export const SENTENCE_QUESTIONS = {
  reveals: LESSON_GATE_QUESTIONS.reveals,
  self_contained: LESSON_GATE_QUESTIONS.self_contained,
} as const;

type QuestionSet = Record<string, { type: "noul" | "choice" }>;

type JevAnswers<Q extends QuestionSet> = {
  [K in keyof Q]: Q[K]["type"] extends "noul" ? number : string;
};

export function lessonBand(scores: LessonGateScores): LessonBand {
  if (scores.strict >= 0.65 && scores.explicitness === "explicit" && scores.reveals >= 0.5) {
    return "auto";
  }
  if ((scores.strict >= 0.5 && scores.reveals >= 0.5) || scores.reveals >= 0.6) return "pending";
  return "drop";
}

/** Fenced code is not the user speaking (e.g. `// always validate input`). */
export function stripCodeBlocks(text: string): string {
  return text
    .replace(/```[\s\S]*?(?:```|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitSentences(text: string): string[] {
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  return [...segmenter.segment(text)]
    .map((part) => part.segment.trim())
    .filter((sentence) => sentence.length > 3);
}

export function jevState(prevAssistant: string | null, userMessage: string): string {
  return [
    `Previous assistant message: ${prevAssistant ?? "(none — start of conversation)"}`,
    `User message: ${userMessage}`,
  ].join("\n");
}

/** One Jev evaluation. Throws on missing key, HTTP error, timeout, or a malformed answer. */
export async function askJev<Q extends QuestionSet>(
  state: string,
  questions: Q,
): Promise<JevAnswers<Q>> {
  const key = process.env.TYPESAFE_API_KEY?.trim();
  if (!key) throw new Error("TYPESAFE_API_KEY not set");

  const res = await fetch(JEV_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "jev-latest", state, questions }),
    signal: AbortSignal.timeout(JEV_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`jev HTTP ${res.status}`);

  const body = (await res.json()) as {
    answers?: Record<string, { noul?: unknown; choice?: unknown }>;
  };
  const answers: Record<string, number | string> = {};
  for (const [name, question] of Object.entries(questions)) {
    const answer = body.answers?.[name];
    const value = question.type === "noul" ? answer?.noul : answer?.choice;
    const valid = question.type === "noul" ? typeof value === "number" : typeof value === "string";
    if (!valid) throw new Error(`jev answer missing: ${name}`);
    answers[name] = value as number | string;
  }
  return answers as JevAnswers<Q>;
}

/** One-sentence lesson text when the user's own words don't stand alone. */
export async function writeLessonText(opts: {
  prevAssistant: string | null;
  userMessage: string;
  focus: string;
}): Promise<string | null> {
  const output = await getLessonWriterAgent().generate(
    [
      `Previous assistant message: ${opts.prevAssistant ?? "(none)"}`,
      `User message: ${opts.userMessage}`,
      `Most relevant part: ${opts.focus}`,
    ].join("\n"),
    {
      // Reasoning models (gpt-oss) spend output tokens thinking first; MAX_LESSON_CHARS caps the text.
      modelSettings: { temperature: 0, maxOutputTokens: 512 },
      abortSignal: AbortSignal.timeout(WRITER_TIMEOUT_MS),
    },
  );
  const text = (output.text ?? "")
    .trim()
    .replace(/^["'“]|["'”]$/g, "")
    .trim();
  return text && text.length <= MAX_LESSON_CHARS ? text : null;
}

async function pickLessonText(opts: {
  prevAssistant: string | null;
  userMessage: string;
  turnSelfContained: number;
}): Promise<string | null> {
  const sentences = splitSentences(opts.userMessage);
  let best = { sentence: opts.userMessage, reveals: 1, selfContained: opts.turnSelfContained };

  if (sentences.length > MAX_SCORED_SENTENCES) {
    // Too long to span-pick cheaply — let the writer summarise the durable part.
    best = { sentence: opts.userMessage, reveals: 1, selfContained: 0 };
  } else if (sentences.length > 1) {
    const settled = await Promise.allSettled(
      sentences.map(async (sentence) => {
        const answers = await askJev(jevState(opts.prevAssistant, sentence), SENTENCE_QUESTIONS);
        return { sentence, reveals: answers.reveals, selfContained: answers.self_contained };
      }),
    );
    // A failed sentence call only loses that sentence; if all fail, keep the whole-message pick.
    const scored = settled.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    if (scored.length > 0) best = scored.sort((a, b) => b.reveals - a.reveals)[0];
  }

  if (best.selfContained >= VERBATIM_MIN && best.sentence.length <= MAX_LESSON_CHARS) {
    return best.sentence;
  }
  return writeLessonText({
    prevAssistant: opts.prevAssistant,
    userMessage: opts.userMessage,
    focus: best.sentence,
  });
}

/**
 * Decide what (if anything) this user turn teaches. Never rejects: any failure → `[]`
 * (fail closed — chat continues, nothing is remembered this turn).
 */
export async function gateLesson(opts: {
  userId: string;
  threadId: string;
  userMessage: string;
}): Promise<GatedLesson[]> {
  try {
    const userMessage = stripCodeBlocks(opts.userMessage);
    if (!userMessage) return [];

    const prevAssistant = await lastAssistantMessageText({
      userId: opts.userId,
      threadId: opts.threadId,
    });
    const answers = await askJev(jevState(prevAssistant, userMessage), LESSON_GATE_QUESTIONS);
    const scores: LessonGateScores = {
      strict: answers.strict,
      reveals: answers.reveals,
      explicitness: answers.explicitness,
    };
    const band = lessonBand(scores);
    if (band === "drop") return [];

    const text = await pickLessonText({
      prevAssistant,
      userMessage,
      turnSelfContained: answers.self_contained,
    });
    if (!text) return [];

    const kind = GATED_KINDS.find((k) => k === answers.kind) ?? "preference";
    console.info(
      "[lesson-gate]",
      JSON.stringify({ threadId: opts.threadId, band, ...scores, kind: answers.kind }),
    );
    return [
      {
        text,
        kind,
        activate: band === "auto",
        confidence: scores.reveals >= 0.85 ? "high" : scores.reveals >= 0.6 ? "medium" : "low",
      },
    ];
  } catch (error) {
    console.warn("[lesson-gate] skipped:", error instanceof Error ? error.message : error);
    return [];
  }
}
