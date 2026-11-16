import { Agent } from "@mastra/core/agent";
import type { MastraModelConfig } from "@mastra/core/llm";
import { CHUNK_SUMMARY_INSTRUCTIONS } from "@syraa/history";
import { requireChatModel, toMastraModelId } from "../model.js";

export const HISTORY_SUMMARIZER_AGENT_ID = "history-summarizer";

/** The chat model, or another model on the same provider when `HISTORY_SUMMARY_MODEL` names one. */
export function historySummaryModelConfig(): MastraModelConfig {
  const chat = requireChatModel();
  const slug = process.env.HISTORY_SUMMARY_MODEL?.trim();
  if (!slug) return chat.mastraModel;
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
    model: () => historySummaryModelConfig(),
  });
}
