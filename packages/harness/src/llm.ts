import type { MemoryItem } from "@syraa/memory";
import { runWithChatContext } from "./chat-run-context.js";
import { getSyraaAgent } from "./mastra/index.js";
import { resolveTurnFromGenerateOutput } from "./mastra/resolve-turn.js";
import { buildStructuredTurnOutput } from "./mastra/structured-turn.js";
import { resolveChatModel, resolveChatProvider } from "./mastra/model.js";
import { buildTurnInstructions } from "./turn-instructions.js";
import {
  type ChatMessage,
  type ChatProvider,
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

async function buildChatTurnOptions(opts: {
  userId: string;
  threadId: string;
  memoryItems: MemoryItem[];
}) {
  return {
    memory: {
      thread: opts.threadId,
      resource: opts.userId,
    },
    instructions: await buildTurnInstructions(opts.userId, opts.memoryItems),
    structuredOutput: buildStructuredTurnOutput(),
    modelSettings: {
      temperature: 0.4,
      maxOutputTokens: 2048,
    },
    maxSteps: 50,
  };
}

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
  userId: string;
  threadId: string;
  userMessage: string;
  memoryItems: MemoryItem[];
}) {
  const chat = resolveChatModel();
  if (!chat) {
    const provider = resolveChatProvider();
    const keyEnv = DEFAULTS[provider].apiKeyEnv;
    throw new Error(`Set ${keyEnv} in .env to use chat`);
  }

  const agent = getSyraaAgent();

  return runWithChatContext({ userId: opts.userId, threadId: opts.threadId }, async () => {
      let output: Awaited<ReturnType<typeof agent.generate>>;
      try {
        output = await agent.generate(opts.userMessage, await buildChatTurnOptions(opts));
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`${chat.provider} generate failed: ${detail}`);
      }

      const turn = await resolveTurnFromGenerateOutput(output);

      return {
        message: turn.message,
        lessons: turn.lessons,
        model: chat.model,
        provider: chat.provider,
      };
    },
  );
}

export { resolveChatProvider } from "./mastra/model.js";
export type { ChatMessage, ChatProvider };
