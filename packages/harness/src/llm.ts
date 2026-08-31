import type { MemoryItem } from "@everyday/memory";
import type { MessageListInput } from "@mastra/core/agent/message-list";
import { getEverydayAgent } from "./mastra/index.js";
import { resolveChatModel, resolveChatProvider } from "./mastra/model.js";
import { buildSystemPrompt } from "./mastra/prompt.js";
import {
  type ChatMessage,
  type ChatProvider,
  turnResultSchema,
  ValidationError,
} from "./schemas.js";

export type ChatConfig = {
  provider: ChatProvider;
  model: string;
  configured: boolean;
};

const DEFAULTS: Record<ChatProvider, { model: string; apiKeyEnv: string; modelEnv: string }> = {
  fireworks: {
    model: "accounts/fireworks/models/gpt-oss-120b",
    apiKeyEnv: "FIREWORKS_API_KEY",
    modelEnv: "FIREWORKS_MODEL",
  },
  openai: {
    model: "gpt-4o-mini",
    apiKeyEnv: "OPENAI_API_KEY",
    modelEnv: "OPENAI_MODEL",
  },
};

export function getChatConfig(): ChatConfig {
  const provider = resolveChatProvider();
  const defaults = DEFAULTS[provider];
  const chat = resolveChatModel();
  return {
    provider,
    model: chat?.model ?? process.env[defaults.modelEnv]?.trim() ?? defaults.model,
    configured: chat !== null,
  };
}

export async function runChatTurn(opts: {
  userMessage: string;
  history: ChatMessage[];
  memoryItems: MemoryItem[];
}) {
  const chat = resolveChatModel();
  if (!chat) {
    const provider = resolveChatProvider();
    const keyEnv = DEFAULTS[provider].apiKeyEnv;
    throw new Error(`Set ${keyEnv} in .env to use chat`);
  }

  const agent = getEverydayAgent();
  const messages = [
    ...opts.history.slice(-20).map((message) => ({
      role: message.role,
      content: message.content,
    })),
    { role: "user", content: opts.userMessage },
  ] as MessageListInput;

  let output: Awaited<ReturnType<typeof agent.generate>>;
  try {
    output = await agent.generate(messages, {
      instructions: buildSystemPrompt(opts.memoryItems),
      structuredOutput: {
        schema: turnResultSchema,
      },
      modelSettings: {
        temperature: 0.4,
        maxOutputTokens: 2048,
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${chat.provider} generate failed: ${detail}`);
  }

  const parsed = turnResultSchema.safeParse(output.object);
  if (!parsed.success) {
    throw new ValidationError(`Invalid model output: ${parsed.error.message}`);
  }

  const turn = {
    message: parsed.data.message.trim(),
    lessons: parsed.data.lessons ?? [],
  };

  return { ...turn, model: chat.model, provider: chat.provider };
}

export { resolveChatProvider } from "./mastra/model.js";
export type { ChatMessage, ChatProvider };
