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
  };
}
