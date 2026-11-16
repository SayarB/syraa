import { isExpensive, LIST_TIMEOUT_MS, type ListedModel, type ModelProvider } from "./types.js";

function perMillion(value: unknown): number | undefined {
  const perToken =
    typeof value === "string" || typeof value === "number" ? Number(value) : Number.NaN;
  return Number.isFinite(perToken) && perToken >= 0 ? perToken * 1_000_000 : undefined;
}

type GatewayEntry = {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  owned_by?: unknown;
  context_window?: unknown;
  tags?: unknown;
  supported_parameters?: unknown;
  pricing?: { input?: unknown; output?: unknown } | null;
};

const stringList = (value: unknown): string[] | undefined =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : undefined;

/**
 * Language models from the gateway's `/models` payload, sorted by maker then name. Other kinds
 * (image, video, embedding, speech…) are left out. Anything that isn't shaped as expected is skipped.
 */
export function parseGatewayModels(json: unknown): ListedModel[] {
  const data = (json as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];

  const models: ListedModel[] = [];
  for (const entry of data as GatewayEntry[]) {
    if (entry?.type !== "language" || typeof entry.id !== "string" || !entry.id) continue;

    const tags = stringList(entry.tags);
    const params = stringList(entry.supported_parameters);
    const inputPerMillion = perMillion(entry.pricing?.input);
    const outputPerMillion = perMillion(entry.pricing?.output);

    models.push({
      id: entry.id,
      label: typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : entry.id,
      group: typeof entry.owned_by === "string" ? entry.owned_by : entry.id.split("/")[0],
      ...(inputPerMillion !== undefined ? { inputPerMillion } : {}),
      ...(outputPerMillion !== undefined ? { outputPerMillion } : {}),
      expensive: isExpensive(inputPerMillion, outputPerMillion),
      ...(typeof entry.context_window === "number" ? { contextWindow: entry.context_window } : {}),
      ...(tags || params
        ? { tools: !!(tags?.includes("tool-use") || params?.includes("tools")) }
        : {}),
      ...(tags ? { reasoning: tags.includes("reasoning") } : {}),
      ...(params ? { temperature: params.includes("temperature") } : {}),
    });
  }

  return models.sort(
    (a, b) => (a.group ?? "").localeCompare(b.group ?? "") || a.label.localeCompare(b.label),
  );
}

/** Vercel AI Gateway. Its model list is public, so no key is sent. */
export const gatewayProvider: ModelProvider = {
  id: "gateway",
  label: "Vercel AI Gateway",
  async listModels({ baseUrl }, fetchFn) {
    const res = await fetchFn(`${baseUrl}/models`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`model list HTTP ${res.status}`);
    return parseGatewayModels(await res.json());
  },
};
