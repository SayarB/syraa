import type { MastraModelConfig } from "@mastra/core/llm";
import {
  PROVIDER_DEFAULTS,
  requireChatModel,
  resolveChatProvider,
  toMastraModelId,
} from "../mastra/model.js";
import { fireworksProvider } from "./fireworks.js";
import { gatewayProvider } from "./gateway.js";
import { openaiProvider } from "./openai.js";
import type { ModelProvider, ProviderCredentials, ProviderId } from "./types.js";

export type { ListedModel, ModelProvider, ProviderCredentials, ProviderId } from "./types.js";

/** Every provider Syraa knows. A provider is *offered* only when its API key is set. */
export const PROVIDERS: Record<ProviderId, ModelProvider> = {
  gateway: gatewayProvider,
  fireworks: fireworksProvider,
  openai: openaiProvider,
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

/** Setting value meaning "the server's default model". */
export const SAME_AS_CHAT_MODEL = "chat";

/** The provider's key and base URL from the environment, or null when it has no key (not offered). */
export function providerCredentials(id: ProviderId): ProviderCredentials | null {
  const defaults = PROVIDER_DEFAULTS[id];
  const apiKey = process.env[defaults.apiKeyEnv]?.trim();
  if (!apiKey) return null;
  const baseUrl = (process.env[defaults.baseUrlEnv]?.trim() || defaults.baseUrl).replace(/\/$/, "");
  return { apiKey, baseUrl };
}

export function configuredProviders(): ProviderId[] {
  return PROVIDER_IDS.filter((id) => providerCredentials(id) !== null);
}

/**
 * A model chosen by the user, as `provider:slug` (e.g. `gateway:openai/gpt-5-mini`), or "chat" for
 * the server's default model. Slugs can contain "/" but provider ids never contain ":", so the
 * first ":" splits them. A value with no provider prefix is a setting saved before providers were
 * named; it means a model on the server's default provider.
 */
export function formatModelRef(provider: ProviderId, slug: string): string {
  return `${provider}:${slug}`;
}

export function parseModelRef(
  ref: string | undefined,
): { providerId: ProviderId; slug: string } | null {
  if (!ref || ref === SAME_AS_CHAT_MODEL) return null;
  const colon = ref.indexOf(":");
  const prefix = colon > 0 ? ref.slice(0, colon) : "";
  if ((PROVIDER_IDS as string[]).includes(prefix)) {
    return { providerId: prefix as ProviderId, slug: ref.slice(colon + 1) };
  }
  return { providerId: resolveChatProvider(), slug: ref };
}

/** A stored model value in the current format (legacy plain slugs get the default provider). */
export function normaliseModelRef(ref: string): string {
  const parsed = parseModelRef(ref);
  return parsed ? formatModelRef(parsed.providerId, parsed.slug) : SAME_AS_CHAT_MODEL;
}

export type ModelSelection = {
  providerId: ProviderId;
  slug: string;
  config: MastraModelConfig;
};

/**
 * The model to call for `ref`, with the credentials of its provider. "chat", nothing, or a model on
 * a provider that has no key all give the server's default model, so a stale setting never breaks a
 * turn. Synchronous: whether the model is still offered is checked separately (`usableModelRef`).
 */
export function selectModel(ref: string | undefined): ModelSelection {
  const parsed = parseModelRef(ref);
  const credentials = parsed ? providerCredentials(parsed.providerId) : null;
  if (parsed && credentials) {
    return {
      providerId: parsed.providerId,
      slug: parsed.slug,
      config: {
        id: toMastraModelId(parsed.providerId, parsed.slug),
        url: credentials.baseUrl,
        apiKey: credentials.apiKey,
      },
    };
  }
  const chat = requireChatModel();
  return { providerId: chat.provider, slug: chat.model, config: chat.mastraModel };
}
