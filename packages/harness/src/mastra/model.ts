import type { MastraModelConfig } from "@mastra/core/llm";
import type { ChatProvider } from "../schemas.js";

export function resolveChatProvider(): ChatProvider {
  const explicit = process.env.CHAT_PROVIDER?.trim().toLowerCase();
  if (explicit === "fireworks" || explicit === "openai") return explicit;
  if (process.env.FIREWORKS_API_KEY?.trim()) return "fireworks";
  if (process.env.OPENAI_API_KEY?.trim()) return "openai";
  return "fireworks";
}

const DEFAULTS: Record<
  ChatProvider,
  { model: string; baseUrl: string; apiKeyEnv: string; modelEnv: string; baseUrlEnv: string }
> = {
  fireworks: {
    model: "accounts/fireworks/models/gpt-oss-120b",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    apiKeyEnv: "FIREWORKS_API_KEY",
    modelEnv: "FIREWORKS_MODEL",
    baseUrlEnv: "FIREWORKS_BASE_URL",
  },
  openai: {
    model: "gpt-4o-mini",
    baseUrl: "https://api.openai.com/v1",
    apiKeyEnv: "OPENAI_API_KEY",
    modelEnv: "OPENAI_MODEL",
    baseUrlEnv: "OPENAI_BASE_URL",
  },
};

export type ResolvedChatModel = {
  provider: ChatProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
  mastraModel: MastraModelConfig;
};

function toMastraModelId(provider: ChatProvider, model: string): `${string}/${string}` {
  if (model.includes("/")) {
    const [prefix] = model.split("/", 1);
    if (
      prefix === "openai" ||
      prefix === "fireworks" ||
      prefix === "fireworks-ai" ||
      prefix === "fireworks_ai"
    ) {
      return model as `${string}/${string}`;
    }
  }

  if (provider === "fireworks") {
    return `fireworks-ai/${model}`;
  }

  return `openai/${model}`;
}

export function resolveChatModel(): ResolvedChatModel | null {
  const provider = resolveChatProvider();
  const defaults = DEFAULTS[provider];
  const apiKey = process.env[defaults.apiKeyEnv]?.trim();
  if (!apiKey) return null;

  const model = process.env[defaults.modelEnv]?.trim() || defaults.model;
  const baseUrl = (process.env[defaults.baseUrlEnv]?.trim() || defaults.baseUrl).replace(/\/$/, "");
  const mastraModelId = toMastraModelId(provider, model);

  // Always pass apiKey so Docker/Mastra does not rely solely on ambient env discovery.
  const mastraModel: MastraModelConfig = {
    id: mastraModelId,
    url: baseUrl,
    apiKey,
  };

  return { provider, apiKey, model, baseUrl, mastraModel };
}

export function requireChatModel(): ResolvedChatModel {
  const chat = resolveChatModel();
  if (!chat) {
    const provider = resolveChatProvider();
    const keyEnv = DEFAULTS[provider].apiKeyEnv;
    throw new Error(`Set ${keyEnv} in .env to use chat`);
  }
  return chat;
}
