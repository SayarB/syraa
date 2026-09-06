import { turnResultSchema } from "../schemas.js";
import { requireChatModel } from "./model.js";

/**
 * Mastra structured turn output. Uses a separate structuring pass so the main
 * agent can call tools, then a model extracts `{ message, lessons }`.
 *
 * @see https://mastra.ai/docs/agents/structured-output
 */
export function buildStructuredTurnOutput() {
  const chat = requireChatModel();
  return {
    schema: turnResultSchema,
    model: chat.mastraModelId,
    useAgent: true,
    jsonPromptInjection: "auto" as const,
    instructions: [
      "Extract the user-facing reply into message only — a clean chat answer with no internal footers.",
      "lessons must be [] unless the user explicitly taught a durable fact about themselves (remember that, from now on, always/never, or a clear standing preference/rule).",
      "Research, recommendations, comparisons, and one-off questions → lessons: []. Do not infer interests from the topic they asked about.",
      'Strip any runtime text from message: no "Working memory updated", "Lesson extracted", recaps, memory dumps, tool logs, or status footers — even in italics or after "---".',
      "If the draft ends with internal metadata, remove it before returning message.",
    ].join(" "),
  };
}
