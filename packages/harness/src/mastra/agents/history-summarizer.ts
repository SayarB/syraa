import { Agent } from "@mastra/core/agent";
import type { MastraModelConfig } from "@mastra/core/llm";
import { CHUNK_SUMMARY_INSTRUCTIONS } from "@syraa/history";
import { selectModel } from "../../providers/index.js";

export const HISTORY_SUMMARIZER_AGENT_ID = "history-summarizer";

/** Request-context key holding the model ref the summaries are written with. */
export const HISTORY_SUMMARY_MODEL_CONTEXT_KEY = "historySummaryModel";

/** Model config for a summary model ref (see `selectModel`): the model it names, or the server's default for "chat". */
export function historySummaryModelConfig(ref: string | undefined): MastraModelConfig {
  return selectModel(ref).config;
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
