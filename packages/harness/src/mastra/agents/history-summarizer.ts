import { Agent } from "@mastra/core/agent";
import type { MastraModelConfig } from "@mastra/core/llm";
import { CHUNK_SUMMARY_INSTRUCTIONS } from "@syraa/history";
import { SAME_AS_CHAT_MODEL } from "../../settings.js";
import { requireChatModel, toMastraModelId } from "../model.js";

export const HISTORY_SUMMARIZER_AGENT_ID = "history-summarizer";

/** Request-context key holding the user's `historySummaryModel` setting. */
export const HISTORY_SUMMARY_MODEL_CONTEXT_KEY = "historySummaryModel";

/** The chat model, or the user's chosen model on the same provider. */
export function historySummaryModelConfig(slug: string | undefined): MastraModelConfig {
  const chat = requireChatModel();
  if (!slug || slug === SAME_AS_CHAT_MODEL) return chat.mastraModel;
  return { id: toMastraModelId(chat.provider, slug), url: chat.baseUrl, apiKey: chat.apiKey };
}

/**
 * Summarises older turns of a thread so they can leave the prompt. Runs in the background after a
 * turn; it has no tools and never sees anything but the transcript it is given.
 */
export function createHistorySummarizerAgent(): Agent {
  return new Agent({
    id: HISTORY_SUMMARIZER_AGENT_ID,
    name: "History Summarizer",
    description: "Summarises older chat turns so they can be replaced by a short note.",
    instructions: CHUNK_SUMMARY_INSTRUCTIONS,
    model: ({ requestContext }) =>
      historySummaryModelConfig(
        requestContext.get(HISTORY_SUMMARY_MODEL_CONTEXT_KEY) as string | undefined,
      ),
  });
}
