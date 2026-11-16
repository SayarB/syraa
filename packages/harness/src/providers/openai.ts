import { LIST_TIMEOUT_MS, type ListedModel, type ModelProvider } from "./types.js";

/** OpenAI's list has every model it sells; these are the ones that chat. */
const CHAT_MODEL = /^(gpt-|chatgpt-|o\d)/i;
const NOT_A_CHAT_MODEL =
  /(embedding|whisper|tts|dall-e|moderation|audio|realtime|transcribe|image|search-preview|instruct|computer-use|davinci|babbage)/i;
/** The o-series and gpt-5 think before answering and only accept their default temperature. */
const REASONING_MODEL = /^(o\d|gpt-5)/i;

/**
 * Chat models from OpenAI's `/models` payload. The list says nothing about price, context or
 * tool use, so those are left unknown, except what is known of a model family: all of these call
 * tools, and the reasoning families take no temperature.
 */
export function parseOpenAiModels(json: unknown): ListedModel[] {
  const data = (json as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];

  const models: ListedModel[] = [];
  for (const entry of data as { id?: unknown }[]) {
    const id = entry?.id;
    if (typeof id !== "string" || !CHAT_MODEL.test(id) || NOT_A_CHAT_MODEL.test(id)) continue;
    const reasoning = REASONING_MODEL.test(id);
    models.push({
      id,
      label: id,
      group: "OpenAI",
      tools: true,
      reasoning,
      temperature: !reasoning,
    });
  }
  return models.sort((a, b) => a.label.localeCompare(b.label));
}

export const openaiProvider: ModelProvider = {
  id: "openai",
  label: "OpenAI",
  async listModels({ apiKey, baseUrl }, fetchFn) {
    const res = await fetchFn(`${baseUrl}/models`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`model list HTTP ${res.status}`);
    return parseOpenAiModels(await res.json());
  },
};
