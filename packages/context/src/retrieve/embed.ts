export type QueryEmbedder = (text: string) => Promise<number[] | null>;

export type RemoteEmbeddingConfig = {
  provider: "fireworks" | "openai";
  model: string;
  baseUrl: string;
  apiKey: string;
};

export type EmbeddingConfig = { provider: "none" } | { provider: "hash" } | RemoteEmbeddingConfig;

type Env = Record<string, string | undefined>;

function envValue(env: Env, key: string): string {
  return env[key]?.trim() ?? "";
}

/** Mirrors services/ingest-worker/syraa_ingest/embed.py `resolve_embedding_config`. */
export function resolveEmbeddingConfig(env: Env = process.env): EmbeddingConfig {
  let provider = (envValue(env, "EMBEDDING_PROVIDER") || "auto").toLowerCase();
  if (["none", "off", "null"].includes(provider)) return { provider: "none" };

  const fireworksKey = envValue(env, "FIREWORKS_API_KEY");
  const openaiKey = envValue(env, "OPENAI_API_KEY");
  const fallbackKey = envValue(env, "EMBEDDING_API_KEY");

  if (provider === "auto") {
    if (fireworksKey) provider = "fireworks";
    else if (openaiKey) provider = "openai";
    else return { provider: "none" };
  }

  if (provider === "fireworks") {
    return {
      provider,
      model: envValue(env, "EMBEDDING_MODEL") || "nomic-ai/nomic-embed-text-v1.5",
      baseUrl: (
        envValue(env, "EMBEDDING_BASE_URL") || "https://api.fireworks.ai/inference/v1"
      ).replace(/\/+$/, ""),
      apiKey: fireworksKey || fallbackKey,
    };
  }

  if (provider === "openai") {
    return {
      provider,
      model: envValue(env, "EMBEDDING_MODEL") || "text-embedding-3-small",
      baseUrl: (envValue(env, "EMBEDDING_BASE_URL") || "https://api.openai.com/v1").replace(
        /\/+$/,
        "",
      ),
      apiKey: openaiKey || fallbackKey,
    };
  }

  if (provider === "hash") return { provider: "hash" };

  throw new Error(`unknown EMBEDDING_PROVIDER=${provider}`);
}

/**
 * Query embedder matching ingest's remote provider. `null` when embeddings are
 * off or hash-stubbed — hash vectors are not semantic, so search stays lexical.
 */
export function createQueryEmbedder(env: Env = process.env): QueryEmbedder | null {
  let config: EmbeddingConfig;
  try {
    config = resolveEmbeddingConfig(env);
  } catch {
    return null;
  }
  if (config.provider === "none" || config.provider === "hash" || !config.apiKey) return null;

  const { model, baseUrl, apiKey } = config;
  return async (text) => {
    const res = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: [text] }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new Error(`embedding HTTP ${res.status}`);
    }
    const payload = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
    const embedding = payload.data?.[0]?.embedding;
    return Array.isArray(embedding) && embedding.length > 0 ? embedding : null;
  };
}
