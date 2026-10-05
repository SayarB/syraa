import { Agent } from "@mastra/core/agent";
import type { MastraModelConfig } from "@mastra/core/llm";
import { SAME_AS_CHAT_MODEL } from "../../settings.js";
import { requireChatModel, toMastraModelId } from "../model.js";

export const TITLE_WRITER_AGENT_ID = "title-writer";

/** Request-context key holding the user's `titleModel` setting. */
export const TITLE_MODEL_CONTEXT_KEY = "titleModel";

/** Model config for a `titleModel` setting: the chat model, or another model on the same provider. */
export function titleModelConfig(titleModel: string | undefined): MastraModelConfig {
  const chat = requireChatModel();
  if (!titleModel || titleModel === SAME_AS_CHAT_MODEL) return chat.mastraModel;
  return {
    id: toMastraModelId(chat.provider, titleModel),
    url: chat.baseUrl,
    apiKey: chat.apiKey,
  };
}

/** Names a chat thread from its opening messages. */
export function createTitleWriterAgent(): Agent {
  return new Agent({
    id: TITLE_WRITER_AGENT_ID,
    name: "Title Writer",
    description: "Writes a short title for a chat thread.",
    instructions: [
      "Write a title of 3 to 6 words for the chat below, saying what it is about.",
      "Use the language the user wrote in. Use sentence case.",
      "Reply with the title only: no quotes, no trailing punctuation, no preamble.",
    ].join(" "),
    model: ({ requestContext }) =>
      titleModelConfig(requestContext.get(TITLE_MODEL_CONTEXT_KEY) as string | undefined),
  });
}
