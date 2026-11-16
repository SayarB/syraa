import { requireChatModel } from "./mastra/model.js";
import {
  configuredProviders,
  formatModelRef,
  type ListedModel,
  PROVIDERS,
  type ProviderCredentials,
  type ProviderId,
  parseModelRef,
  providerCredentials,
  SAME_AS_CHAT_MODEL,
} from "./providers/index.js";

export { parseFireworksModels } from "./providers/fireworks.js";
export { parseGatewayModels } from "./providers/gateway.js";
export { parseOpenAiModels } from "./providers/openai.js";
export {
  EXPENSIVE_INPUT_PER_MILLION,
  EXPENSIVE_OUTPUT_PER_MILLION,
} from "./providers/types.js";

/** A model a user can pick for a setting, as the settings pickers receive it. */
export type ModelOption = Omit<ListedModel, "id"> & {
  /** The saved value: `provider:slug` (see `formatModelRef`). */
  id: string;
  providerId: ProviderId;
  /** The provider's own name for the model. */
  slug: string;
  /** Picker heading. */
  group: string;
  /** Can run the assistant: it can call tools and has room for the conversation. */
  chatCapable: boolean;
};

/** The assistant sends the instructions, history and tool results with every call. */
export const MIN_CHAT_CONTEXT_TOKENS = 64_000;

/**
 * Whether a model can be the chat model. The assistant needs tool calls, so a model that says it
 * can't call tools is out, as is one with too little context. A provider that doesn't say gets the
 * benefit of the doubt.
 */
export function isChatCapable(model: Pick<ListedModel, "tools" | "contextWindow">): boolean {
  if (model.tools === false) return false;
  return model.contextWindow === undefined || model.contextWindow >= MIN_CHAT_CONTEXT_TOKENS;
}

export type ModelCatalog = {
  /** The provider's models, cached. Throws if they have never been fetched and can't be now. */
  list(): Promise<ListedModel[]>;
  /** What is cached right now, if anything. Never fetches. */
  peek(): ListedModel[] | undefined;
};

const DEFAULT_TTL_MS = 60 * 60_000;

/**
 * One provider's model list, fetched on demand and kept for an hour. If a refresh fails, the last
 * good list keeps being served rather than breaking the settings page; a provider with a built-in
 * fallback list serves that when it has never been fetched.
 */
export function createModelCatalog(
  provider: Pick<(typeof PROVIDERS)[ProviderId], "listModels" | "fallbackModels">,
  options: {
    credentials?: () => ProviderCredentials | null;
    // Looked up at call time, so tests (and runtimes that swap `fetch`) can replace it.
    fetchFn?: typeof fetch;
    ttlMs?: number;
    now?: () => number;
  } = {},
): ModelCatalog {
  const fetchFn: typeof fetch = options.fetchFn ?? ((input, init) => fetch(input, init));
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const now = options.now ?? Date.now;

  let cached: { models: ListedModel[]; at: number } | null = null;
  let refreshing: Promise<ListedModel[]> | null = null;

  async function refresh(): Promise<ListedModel[]> {
    const credentials = options.credentials?.();
    if (!credentials) throw new Error("provider has no API key");
    const models = await provider.listModels(credentials, fetchFn);
    if (models.length === 0) throw new Error("model list was empty");
    cached = { models, at: now() };
    return models;
  }

  return {
    peek: () => cached?.models,
    async list() {
      if (cached && now() - cached.at < ttlMs) return cached.models;
      refreshing ??= refresh().finally(() => {
        refreshing = null;
      });
      try {
        return await refreshing;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (cached) {
          console.warn("[models] refresh failed, serving the last list:", message);
          return cached.models;
        }
        if (provider.fallbackModels) {
          console.warn("[models] list unavailable, using the built-in list:", message);
          return provider.fallbackModels;
        }
        throw error;
      }
    },
  };
}

const catalogs = new Map<ProviderId, ModelCatalog>();

function catalogFor(id: ProviderId): ModelCatalog {
  let catalog = catalogs.get(id);
  if (!catalog) {
    catalog = createModelCatalog(PROVIDERS[id], { credentials: () => providerCredentials(id) });
    catalogs.set(id, catalog);
  }
  return catalog;
}

/** Starts loading every provider's list in the background (at boot), so the first chat turn finds it cached. Never throws. */
export function warmModelCatalogs(): void {
  void getModelOptions().catch(() => undefined);
}

/** Forget every cached list (tests). */
export function resetModelCatalogs(): void {
  catalogs.clear();
}

export type ModelOptions = {
  /** The server's default model: what "chat" means. */
  defaultModel: { id: string; providerId: ProviderId; slug: string };
  /** Providers with a key, and whether their list could be loaded. */
  providers: { id: ProviderId; label: string; ok: boolean }[];
  models: ModelOption[];
};

function toOption(provider: ProviderId, model: ListedModel, grouped: boolean): ModelOption {
  const { id: slug, group, ...rest } = model;
  const heading = group ?? PROVIDERS[provider].label;
  return {
    ...rest,
    id: formatModelRef(provider, slug),
    providerId: provider,
    slug,
    group: grouped ? `${PROVIDERS[provider].label} · ${heading}` : heading,
    chatCapable: isChatCapable(model),
  };
}

/**
 * Every model the user can choose, from every provider that has a key. A provider whose list can't
 * be loaded is reported as not ok and left out; the rest still work. Throws only if providers have
 * keys and none of them could be listed.
 */
export async function getModelOptions(): Promise<ModelOptions> {
  const ids = configuredProviders();
  const results = await Promise.allSettled(ids.map((id) => catalogFor(id).list()));
  const grouped = ids.length > 1;

  const providers: ModelOptions["providers"] = [];
  const models: ModelOption[] = [];
  results.forEach((result, index) => {
    const id = ids[index];
    providers.push({ id, label: PROVIDERS[id].label, ok: result.status === "fulfilled" });
    if (result.status === "fulfilled") {
      for (const model of result.value) models.push(toOption(id, model, grouped));
    } else {
      console.warn(`[models] ${id} list failed:`, result.reason?.message ?? result.reason);
    }
  });

  if (ids.length > 0 && !providers.some((provider) => provider.ok)) {
    throw new Error("no provider's model list could be loaded");
  }

  const chat = requireChatModel();
  return {
    defaultModel: {
      id: formatModelRef(chat.provider, chat.model),
      providerId: chat.provider,
      slug: chat.model,
    },
    providers,
    models,
  };
}

/** The option for `ref`, or undefined if it isn't offered. Throws if its provider's list can't be loaded. */
export async function findModelOption(ref: string): Promise<ModelOption | undefined> {
  const parsed = parseModelRef(ref);
  if (!parsed || !providerCredentials(parsed.providerId)) return undefined;
  const listed = (await catalogFor(parsed.providerId).list()).find(
    (model) => model.id === parsed.slug,
  );
  return listed ? toOption(parsed.providerId, listed, false) : undefined;
}

/** Whether `ref` is currently offered. Throws if its provider's list can't be loaded. */
export async function isModelAvailable(ref: string): Promise<boolean> {
  return (await findModelOption(ref)) !== undefined;
}

const COLD_LOOKUP_MS = 1500;

/**
 * What is known about a model, for the hot path of a chat turn: from the cache if it is there,
 * otherwise a fetch given a short time to finish. Undefined (unknown) if it doesn't, so a slow or
 * failing list never holds up a reply.
 */
export async function listedModelFast(
  providerId: ProviderId,
  slug: string,
): Promise<ListedModel | undefined> {
  const catalog = catalogFor(providerId);
  const models =
    catalog.peek() ??
    (await Promise.race([
      catalog.list().catch(() => undefined),
      new Promise<undefined>((resolve) => setTimeout(resolve, COLD_LOOKUP_MS)),
    ]));
  return models?.find((model) => model.id === slug);
}

/**
 * `ref` if the model is still offered, otherwise "chat" (the server's default). If the provider's
 * list can't be loaded the chosen model is kept: an outage of the list shouldn't change the model.
 */
export async function usableModelRef(ref: string | undefined): Promise<string> {
  if (!ref || ref === SAME_AS_CHAT_MODEL) return SAME_AS_CHAT_MODEL;
  try {
    if (await isModelAvailable(ref)) return ref;
    console.warn(`[models] ${ref} is no longer offered; using the default model`);
    return SAME_AS_CHAT_MODEL;
  } catch {
    return ref;
  }
}
