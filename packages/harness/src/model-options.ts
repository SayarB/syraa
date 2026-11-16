import { gatewayBaseUrl, resolveChatProvider } from "./mastra/model.js";

/** A model a user can pick for a setting (title writer, history summariser). */
export type ModelOption = {
  /** The slug sent to the provider, e.g. `openai/gpt-5-mini` on the gateway. */
  id: string;
  label: string;
  /** Who makes it, for grouping (e.g. `openai`). */
  provider?: string;
  /** US dollars per million tokens, when the provider lists a price. */
  inputPerMillion?: number;
  outputPerMillion?: number;
  /** Priced high enough that it deserves a warning: the app's key pays for every call. */
  expensive?: boolean;
};

/** A model costing at least this much per million input tokens, or output tokens, is flagged. */
export const EXPENSIVE_INPUT_PER_MILLION = 3;
export const EXPENSIVE_OUTPUT_PER_MILLION = 15;

/** Fast, low-cost Fireworks models offered when chat runs on Fireworks. */
const FIREWORKS_MODELS: ModelOption[] = [
  { id: "accounts/fireworks/models/glm-5p3-flash", label: "GLM 5.3 Flash" },
  { id: "accounts/fireworks/models/deepseek-v4p1-flash", label: "DeepSeek V4.1 Flash" },
];

function perMillion(value: unknown): number | undefined {
  const perToken =
    typeof value === "string" || typeof value === "number" ? Number(value) : Number.NaN;
  return Number.isFinite(perToken) && perToken >= 0 ? perToken * 1_000_000 : undefined;
}

/**
 * Language models from the gateway's `/models` payload, sorted by provider then name. Other kinds
 * (image, video, embedding, speech…) are left out. Anything that isn't shaped as expected is skipped.
 */
export function parseGatewayModels(json: unknown): ModelOption[] {
  const data = (json as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];

  const models: ModelOption[] = [];
  for (const entry of data) {
    const model = entry as {
      id?: unknown;
      name?: unknown;
      type?: unknown;
      owned_by?: unknown;
      pricing?: { input?: unknown; output?: unknown } | null;
    };
    if (model?.type !== "language" || typeof model.id !== "string" || !model.id) continue;

    const inputPerMillion = perMillion(model.pricing?.input);
    const outputPerMillion = perMillion(model.pricing?.output);
    models.push({
      id: model.id,
      label: typeof model.name === "string" && model.name.trim() ? model.name.trim() : model.id,
      provider: typeof model.owned_by === "string" ? model.owned_by : model.id.split("/")[0],
      ...(inputPerMillion !== undefined ? { inputPerMillion } : {}),
      ...(outputPerMillion !== undefined ? { outputPerMillion } : {}),
      expensive:
        (inputPerMillion ?? 0) >= EXPENSIVE_INPUT_PER_MILLION ||
        (outputPerMillion ?? 0) >= EXPENSIVE_OUTPUT_PER_MILLION,
    });
  }

  return models.sort(
    (a, b) => (a.provider ?? "").localeCompare(b.provider ?? "") || a.label.localeCompare(b.label),
  );
}

export type ModelCatalog = {
  /** The language models, cached. Throws if the list has never been fetched and can't be now. */
  list(): Promise<ModelOption[]>;
};

const FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_TTL_MS = 60 * 60_000;

/**
 * The gateway's model list, fetched on demand and kept for an hour. The list is public (no key is
 * sent), about half a megabyte, and the same for everyone. If a refresh fails, the last good list
 * keeps being served rather than breaking the settings page.
 */
export function createGatewayModelCatalog(
  options: { fetchFn?: typeof fetch; url?: () => string; ttlMs?: number; now?: () => number } = {},
): ModelCatalog {
  // Looked up at call time, so tests (and runtimes that swap `fetch`) can replace it.
  const fetchFn: typeof fetch = options.fetchFn ?? ((input, init) => fetch(input, init));
  const url = options.url ?? (() => `${gatewayBaseUrl()}/models`);
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const now = options.now ?? Date.now;

  let cached: { models: ModelOption[]; at: number } | null = null;
  let refreshing: Promise<ModelOption[]> | null = null;

  async function refresh(): Promise<ModelOption[]> {
    const res = await fetchFn(url(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`model list HTTP ${res.status}`);
    const models = parseGatewayModels(await res.json());
    if (models.length === 0) throw new Error("model list was empty");
    cached = { models, at: now() };
    return models;
  }

  return {
    async list() {
      if (cached && now() - cached.at < ttlMs) return cached.models;
      refreshing ??= refresh().finally(() => {
        refreshing = null;
      });
      try {
        return await refreshing;
      } catch (error) {
        if (cached) {
          console.warn(
            "[models] refresh failed, serving the last list:",
            error instanceof Error ? error.message : error,
          );
          return cached.models;
        }
        throw error;
      }
    },
  };
}

const gatewayCatalog = createGatewayModelCatalog();

export type ModelOptions = {
  /** Where chat runs; the models offered depend on it, because they are called through the same provider. */
  provider: ReturnType<typeof resolveChatProvider>;
  models: ModelOption[];
};

/** Models a user can choose besides "same as chat": the full gateway list, a short Fireworks list, or none. */
export async function getModelOptions(): Promise<ModelOptions> {
  const provider = resolveChatProvider();
  if (provider === "gateway") return { provider, models: await gatewayCatalog.list() };
  if (provider === "fireworks") return { provider, models: FIREWORKS_MODELS };
  return { provider, models: [] };
}

/** Whether `slug` is currently offered. Throws if the list can't be fetched. */
export async function isModelAvailable(slug: string): Promise<boolean> {
  return (await getModelOptions()).models.some((model) => model.id === slug);
}
