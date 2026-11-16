import type { ChatProvider } from "../schemas.js";

/** The providers Syraa can call models through. */
export type ProviderId = ChatProvider;

/**
 * One model as a provider lists it, in the shape every provider is normalised to. A provider
 * fills in what it knows and leaves the rest out; nothing here is required beyond the id.
 */
export type ListedModel = {
  /** The provider's own name for the model, e.g. `openai/gpt-5-mini` on the gateway. */
  id: string;
  label: string;
  /** Heading to group it under in the picker, e.g. who makes it. */
  group?: string;
  /** US dollars per million tokens, when the provider lists a price. */
  inputPerMillion?: number;
  outputPerMillion?: number;
  /** Priced high enough to deserve a warning: the app's key pays for every call. */
  expensive?: boolean;
  /** Tokens of context the model accepts. */
  contextWindow?: number;
  /** Can call tools. `undefined` means the provider doesn't say. */
  tools?: boolean;
  /** Thinks before it answers, so it needs a larger output budget. */
  reasoning?: boolean;
  /** Accepts a `temperature`. `undefined` means the provider doesn't say. */
  temperature?: boolean;
};

/** What a provider needs to list its models. Today these come from the server's environment. */
export type ProviderCredentials = {
  apiKey: string;
  baseUrl: string;
};

/**
 * A place models come from. To add one: write `listModels` (call its list endpoint with the
 * credentials and return the models in `ListedModel` shape), add it to `PROVIDERS`, and give it
 * defaults in `mastra/model.ts`. Everything else (the picker, validation, caching) follows.
 */
export type ModelProvider = {
  id: ProviderId;
  label: string;
  listModels(credentials: ProviderCredentials, fetchFn: typeof fetch): Promise<ListedModel[]>;
  /** Offered when the list can't be fetched and nothing is cached yet. */
  fallbackModels?: ListedModel[];
};

/** A model costing at least this much per million input tokens, or output tokens, is flagged. */
export const EXPENSIVE_INPUT_PER_MILLION = 3;
export const EXPENSIVE_OUTPUT_PER_MILLION = 15;

export function isExpensive(inputPerMillion?: number, outputPerMillion?: number): boolean {
  return (
    (inputPerMillion ?? 0) >= EXPENSIVE_INPUT_PER_MILLION ||
    (outputPerMillion ?? 0) >= EXPENSIVE_OUTPUT_PER_MILLION
  );
}

export const LIST_TIMEOUT_MS = 10_000;
