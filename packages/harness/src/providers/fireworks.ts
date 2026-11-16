import { LIST_TIMEOUT_MS, type ListedModel, type ModelProvider } from "./types.js";

type FireworksEntry = {
  id?: unknown;
  supports_chat?: unknown;
  supports_tools?: unknown;
  context_length?: unknown;
};

/** "accounts/fireworks/models/glm-5p3-flash" → "glm-5p3-flash". */
const shortName = (id: string) => id.split("/").at(-1) || id;

/**
 * Models from Fireworks' `/models` payload (OpenAI-compatible). It reports whether a model chats,
 * calls tools and its context length. Those field names come from captured responses rather than
 * Fireworks' documentation, so a missing field is treated as "unknown", never as "no".
 */
export function parseFireworksModels(json: unknown): ListedModel[] {
  const data = (json as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];

  const models: ListedModel[] = [];
  for (const entry of data as FireworksEntry[]) {
    if (typeof entry?.id !== "string" || !entry.id) continue;
    if (entry.supports_chat === false) continue;
    models.push({
      id: entry.id,
      label: shortName(entry.id),
      group: "Fireworks",
      ...(typeof entry.supports_tools === "boolean" ? { tools: entry.supports_tools } : {}),
      ...(typeof entry.context_length === "number" ? { contextWindow: entry.context_length } : {}),
    });
  }
  return models.sort((a, b) => a.label.localeCompare(b.label));
}

export const fireworksProvider: ModelProvider = {
  id: "fireworks",
  label: "Fireworks",
  async listModels({ apiKey, baseUrl }, fetchFn) {
    const res = await fetchFn(`${baseUrl}/models`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`model list HTTP ${res.status}`);
    return parseFireworksModels(await res.json());
  },
  // Fast, low-cost models, offered if the list can't be fetched.
  fallbackModels: [
    { id: "accounts/fireworks/models/glm-5p3-flash", label: "GLM 5.3 Flash", group: "Fireworks" },
    {
      id: "accounts/fireworks/models/deepseek-v4p1-flash",
      label: "DeepSeek V4.1 Flash",
      group: "Fireworks",
    },
  ],
};
