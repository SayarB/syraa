import type { MastraModelConfig } from "@mastra/core/llm";
import { RequestContext } from "@mastra/core/request-context";
import { listedModelFast, usableModelRef } from "./model-options.js";
import {
  type ListedModel,
  type ProviderId,
  SAME_AS_CHAT_MODEL,
  selectModel,
} from "./providers/index.js";
import { getUserSettings } from "./settings.js";

/** Request-context key holding the model ref that answers this turn (see `selectModel`). */
export const CHAT_MODEL_CONTEXT_KEY = "chatModel";

const TEMPERATURE = 0.4;
const MAX_OUTPUT_TOKENS = 2048;
/** Models that think before answering spend output tokens on it, so they need more room. */
const REASONING_MAX_OUTPUT_TOKENS = 6144;

export type ChatCallSettings = {
  /** Left out for a model that doesn't accept one. */
  temperature?: number;
  maxOutputTokens: number;
  headers?: Record<string, string>;
};

/** Call settings suited to the model: no temperature where it isn't accepted, more output room for reasoning models. */
export function chatCallSettings(opts: {
  providerId: ProviderId;
  model?: Pick<ListedModel, "temperature" | "reasoning">;
  threadId: string;
}): ChatCallSettings {
  return {
    ...(opts.model?.temperature === false ? {} : { temperature: TEMPERATURE }),
    maxOutputTokens: opts.model?.reasoning ? REASONING_MAX_OUTPUT_TOKENS : MAX_OUTPUT_TOKENS,
    // Fireworks routes a thread's calls to the same prompt cache (long, stable prefix).
    ...(opts.providerId === "fireworks"
      ? { headers: { "x-session-affinity": opts.threadId } }
      : {}),
  };
}

export type PreparedChatModel = {
  ref: string;
  providerId: ProviderId;
  slug: string;
  /** Pass to `agent.stream` / `generate`, so the agent calls this model. */
  requestContext: RequestContext;
  modelSettings: ChatCallSettings;
};

/**
 * The model that answers this user's next turn: their chat model setting, or the server's default
 * if they chose none, it has left the provider's list, or settings can't be read. A broken setting
 * never breaks chat.
 */
export async function prepareChatModel(
  userId: string,
  threadId: string,
): Promise<PreparedChatModel> {
  let chosen = SAME_AS_CHAT_MODEL;
  try {
    chosen = (await getUserSettings(userId)).chatModel;
  } catch (error) {
    console.warn("[chat] settings not read:", error instanceof Error ? error.message : error);
  }

  const ref = await usableModelRef(chosen);
  const { providerId, slug } = selectModel(ref);
  const model = await listedModelFast(providerId, slug);

  const requestContext = new RequestContext();
  requestContext.set(CHAT_MODEL_CONTEXT_KEY, ref);
  return {
    ref,
    providerId,
    slug,
    requestContext,
    modelSettings: chatCallSettings({ providerId, model, threadId }),
  };
}

/** The model config for the agent's `model` function: this turn's model, or the default outside a chat turn (evals, tests). */
export function chatModelConfigFor(
  requestContext: { get(key: string): unknown } | undefined,
): MastraModelConfig {
  return selectModel(requestContext?.get(CHAT_MODEL_CONTEXT_KEY) as string | undefined).config;
}
