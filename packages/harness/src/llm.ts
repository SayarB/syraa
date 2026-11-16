import type { AnySpan } from "@mastra/core/observability";
import type { MemoryItem } from "@syraa/memory";
import { type PreparedChatModel, prepareChatModel } from "./chat-model.js";
import { runWithChatContext } from "./chat-run-context.js";
import { getSyraaAgent } from "./mastra/index.js";
import { resolveChatModel, resolveChatProvider } from "./mastra/model.js";
import { fullReplyText, resolveTurnFromGenerateOutput } from "./mastra/resolve-turn.js";
import type { ChatMessage, ChatProvider } from "./schemas.js";
import { buildTurnInstructions } from "./turn-instructions.js";

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
  gateway: {
    model: "openai/gpt-oss-120b",
    apiKeyEnv: "AI_GATEWAY_API_KEY",
    modelEnv: "AI_GATEWAY_MODEL",
  },
};

async function buildChatTurnOptions(
  opts: {
    userId: string;
    threadId: string;
    memoryItems: MemoryItem[];
    turnSpan?: AnySpan;
  },
  model: PreparedChatModel,
) {
  return {
    memory: {
      thread: opts.threadId,
      resource: opts.userId,
    },
    instructions: await buildTurnInstructions(opts.userId, opts.memoryItems),
    // The user's chat model setting, and call settings suited to that model.
    requestContext: model.requestContext,
    modelSettings: model.modelSettings,
    maxSteps: 50,
    tracingContext: { currentSpan: opts.turnSpan },
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
  /** Langfuse `chat-turn` span; the agent run nests under it. */
  turnSpan?: AnySpan;
}) {
  const chat = resolveChatModel();
  if (!chat) {
    const provider = resolveChatProvider();
    const keyEnv = DEFAULTS[provider].apiKeyEnv;
    throw new Error(`Set ${keyEnv} in .env to use chat`);
  }

  const agent = getSyraaAgent();

  return runWithChatContext(
    { userId: opts.userId, threadId: opts.threadId, currentUserMessage: opts.userMessage },
    async () => {
      const model = await prepareChatModel(opts.userId, opts.threadId);
      let output: Awaited<ReturnType<typeof agent.generate>>;
      try {
        output = await agent.generate(opts.userMessage, await buildChatTurnOptions(opts, model));
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`${model.providerId} generate failed: ${detail}`);
      }

      const turn = await resolveTurnFromGenerateOutput({ text: fullReplyText(output) });

      return {
        message: turn.message,
        model: model.slug,
        provider: model.providerId,
      };
    },
  );
}

export { resolveChatProvider } from "./mastra/model.js";
export type { ChatMessage, ChatProvider };
