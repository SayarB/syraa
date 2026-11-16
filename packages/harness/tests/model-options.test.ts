import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createModelCatalog,
  EXPENSIVE_INPUT_PER_MILLION,
  findModelOption,
  getModelOptions,
  isChatCapable,
  isModelAvailable,
  parseFireworksModels,
  parseGatewayModels,
  parseOpenAiModels,
  resetModelCatalogs,
  usableModelRef,
} from "../src/model-options.js";

const gatewayPayload = {
  data: [
    {
      id: "openai/gpt-5-mini",
      name: "GPT-5 mini",
      type: "language",
      owned_by: "openai",
      context_window: 400000,
      tags: ["tool-use", "reasoning"],
      supported_parameters: ["max_tokens", "tools", "reasoning"],
      pricing: { input: "0.00000025", output: "0.000002" },
    },
    {
      id: "anthropic/claude-opus-x",
      name: "Claude Opus X",
      type: "language",
      owned_by: "anthropic",
      context_window: 200000,
      tags: ["tool-use"],
      supported_parameters: ["max_tokens", "temperature", "tools"],
      pricing: { input: "0.000015", output: "0.000075" },
    },
    {
      id: "anthropic/claude-haiku-x",
      type: "language",
      owned_by: "anthropic",
      context_window: 200000,
      tags: ["tool-use"],
      supported_parameters: ["temperature", "tools"],
      pricing: { input: "0.0000008", output: "0.000004" },
    },
    {
      id: "acme/no-tools",
      name: "No Tools",
      type: "language",
      owned_by: "acme",
      context_window: 128000,
      tags: [],
      supported_parameters: ["temperature"],
      pricing: { input: "0.000001", output: "0.000002" },
    },
    {
      id: "acme/tiny-context",
      name: "Tiny Context",
      type: "language",
      owned_by: "acme",
      context_window: 8000,
      tags: ["tool-use"],
      supported_parameters: ["tools"],
      pricing: { input: "0.000001", output: "0.000002" },
    },
    { id: "openai/text-embedding-x", name: "Embedding", type: "embedding", owned_by: "openai" },
    { id: "bfl/image-x", name: "Image", type: "image", owned_by: "bfl" },
    { name: "no id", type: "language" },
    "garbage",
    null,
  ],
};

describe("parseGatewayModels", () => {
  const models = parseGatewayModels(gatewayPayload);
  const byId = (id: string) => models.find((model) => model.id === id);

  it("keeps only language models and skips malformed entries", () => {
    expect(models.map((model) => model.id).sort()).toEqual([
      "acme/no-tools",
      "acme/tiny-context",
      "anthropic/claude-haiku-x",
      "anthropic/claude-opus-x",
      "openai/gpt-5-mini",
    ]);
  });

  it("sorts by maker, then name, and falls back to the id for a missing name", () => {
    expect(models.map((model) => model.label)).toEqual([
      "No Tools",
      "Tiny Context",
      "anthropic/claude-haiku-x",
      "Claude Opus X",
      "GPT-5 mini",
    ]);
  });

  it("turns per-token prices into dollars per million tokens", () => {
    expect(byId("openai/gpt-5-mini")?.inputPerMillion).toBeCloseTo(0.25);
    expect(byId("openai/gpt-5-mini")?.outputPerMillion).toBeCloseTo(2);
  });

  it("flags only the expensive ones", () => {
    expect(models.filter((model) => model.expensive).map((model) => model.id)).toEqual([
      "anthropic/claude-opus-x",
    ]);
    expect(EXPENSIVE_INPUT_PER_MILLION).toBe(3);
  });

  it("reads tool use, context, reasoning and temperature support", () => {
    expect(byId("openai/gpt-5-mini")).toMatchObject({
      tools: true,
      reasoning: true,
      temperature: false,
      contextWindow: 400000,
    });
    expect(byId("anthropic/claude-haiku-x")).toMatchObject({ tools: true, temperature: true });
    expect(byId("acme/no-tools")?.tools).toBe(false);
  });

  it("returns an empty list for a payload that isn't a model list", () => {
    expect(parseGatewayModels(null)).toEqual([]);
    expect(parseGatewayModels({ data: "nope" })).toEqual([]);
    expect(parseGatewayModels({})).toEqual([]);
  });
});

describe("isChatCapable", () => {
  it("needs tool calling and enough context, and gives the benefit of the doubt when unknown", () => {
    expect(isChatCapable({ tools: true, contextWindow: 128000 })).toBe(true);
    expect(isChatCapable({ tools: false, contextWindow: 128000 })).toBe(false);
    expect(isChatCapable({ tools: true, contextWindow: 8000 })).toBe(false);
    expect(isChatCapable({})).toBe(true);
  });
});

describe("parseOpenAiModels", () => {
  const models = parseOpenAiModels({
    data: [
      { id: "gpt-4o-mini" },
      { id: "o3-mini" },
      { id: "gpt-5" },
      { id: "text-embedding-3-small" },
      { id: "whisper-1" },
      { id: "dall-e-3" },
      { id: "gpt-4o-realtime-preview" },
      { id: "gpt-4o-audio-preview" },
      { id: "gpt-3.5-turbo-instruct" },
      { id: "tts-1" },
      { nope: true },
    ],
  });

  it("keeps the chat models and drops the rest of OpenAI's catalogue", () => {
    expect(models.map((model) => model.id)).toEqual(["gpt-4o-mini", "gpt-5", "o3-mini"]);
  });

  it("knows what a family can do, because the list itself says nothing", () => {
    expect(models.find((model) => model.id === "gpt-4o-mini")).toMatchObject({
      tools: true,
      reasoning: false,
      temperature: true,
    });
    expect(models.find((model) => model.id === "o3-mini")).toMatchObject({
      reasoning: true,
      temperature: false,
    });
    expect(models.every((model) => model.inputPerMillion === undefined)).toBe(true);
  });
});

describe("parseFireworksModels", () => {
  const models = parseFireworksModels({
    data: [
      {
        id: "accounts/fireworks/models/glm-5p3-flash",
        supports_chat: true,
        supports_tools: true,
        context_length: 131072,
      },
      { id: "accounts/fireworks/models/embed-x", supports_chat: false },
      { id: "accounts/fireworks/models/mystery" },
      { not: "a model" },
    ],
  });

  it("drops models that say they don't chat and shortens the name", () => {
    expect(models.map((model) => model.label)).toEqual(["glm-5p3-flash", "mystery"]);
  });

  it("treats a field Fireworks doesn't send as unknown, never as 'no'", () => {
    expect(models[0]).toMatchObject({ tools: true, contextWindow: 131072 });
    expect(models[1].tools).toBeUndefined();
    expect(isChatCapable(models[1])).toBe(true);
  });
});

describe("model catalog", () => {
  const credentials = () => ({ apiKey: "k", baseUrl: "https://p.test/v1" });
  const model = (id: string) => ({ id, label: id });

  it("fetches once and serves the cached list until it expires", async () => {
    let time = 0;
    const listModels = vi.fn(async () => [model("a"), model("b")]);
    const catalog = createModelCatalog(
      { listModels },
      { credentials, ttlMs: 1000, now: () => time },
    );

    expect(await catalog.list()).toHaveLength(2);
    expect(catalog.peek()).toHaveLength(2);
    time = 999;
    await catalog.list();
    expect(listModels).toHaveBeenCalledTimes(1);

    time = 1000;
    await catalog.list();
    expect(listModels).toHaveBeenCalledTimes(2);
  });

  it("sends one request for several callers at once, with the provider's credentials", async () => {
    const listModels = vi.fn(async () => [model("a")]);
    const catalog = createModelCatalog({ listModels }, { credentials });
    await Promise.all([catalog.list(), catalog.list(), catalog.list()]);
    expect(listModels).toHaveBeenCalledTimes(1);
    expect(listModels.mock.calls[0][0]).toEqual({ apiKey: "k", baseUrl: "https://p.test/v1" });
  });

  it("serves the last good list when a refresh fails", async () => {
    let time = 0;
    const listModels = vi
      .fn()
      .mockResolvedValueOnce([model("a")])
      .mockRejectedValueOnce(new Error("HTTP 503"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const catalog = createModelCatalog(
      { listModels },
      { credentials, ttlMs: 1000, now: () => time },
    );

    await catalog.list();
    time = 5000;
    expect(await catalog.list()).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("uses a provider's built-in list when it has never been fetched, otherwise throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const failing = async () => {
      throw new Error("HTTP 500");
    };
    const withFallback = createModelCatalog(
      { listModels: failing, fallbackModels: [model("built-in")] },
      { credentials },
    );
    expect((await withFallback.list()).map((m) => m.id)).toEqual(["built-in"]);

    const without = createModelCatalog({ listModels: failing }, { credentials });
    await expect(without.list()).rejects.toThrow("HTTP 500");

    const empty = createModelCatalog({ listModels: async () => [] }, { credentials });
    await expect(empty.list()).rejects.toThrow("empty");
    warn.mockRestore();
  });

  it("refuses to fetch for a provider with no API key", async () => {
    const listModels = vi.fn();
    const catalog = createModelCatalog({ listModels }, { credentials: () => null });
    await expect(catalog.list()).rejects.toThrow("no API key");
    expect(listModels).not.toHaveBeenCalled();
  });

  it("retries on the next call after a failure", async () => {
    const listModels = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce([model("a")]);
    const catalog = createModelCatalog({ listModels }, { credentials });
    await expect(catalog.list()).rejects.toThrow();
    expect(await catalog.list()).toHaveLength(1);
  });
});

const openAiPayload = { data: [{ id: "gpt-4o-mini" }, { id: "text-embedding-3-small" }] };

/** Answers each provider's list endpoint from a table keyed by URL. */
function stubFetch(routes: Record<string, () => Response>) {
  const fetchMock = vi.fn(async (input: unknown) => {
    const route = routes[String(input)];
    if (!route) throw new Error(`unexpected request to ${String(input)}`);
    return route();
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/models";
const OPENAI_URL = "https://api.openai.com/v1/models";

describe("model options across providers", () => {
  beforeEach(() => {
    resetModelCatalogs();
    vi.stubEnv("CHAT_PROVIDER", "gateway");
    vi.stubEnv("AI_GATEWAY_API_KEY", "gw-key");
    vi.stubEnv("FIREWORKS_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("offers a provider's models only when it has a key", async () => {
    stubFetch({ [GATEWAY_URL]: () => json(gatewayPayload) });
    const { providers, models, defaultModel } = await getModelOptions();
    expect(providers).toEqual([{ id: "gateway", label: "Vercel AI Gateway", ok: true }]);
    expect(models.every((model) => model.providerId === "gateway")).toBe(true);
    expect(defaultModel).toMatchObject({ providerId: "gateway", slug: "openai/gpt-oss-120b" });
  });

  it("uses saved-value ids that carry the provider, and groups by maker", async () => {
    stubFetch({ [GATEWAY_URL]: () => json(gatewayPayload) });
    const { models } = await getModelOptions();
    const mini = models.find((model) => model.slug === "openai/gpt-5-mini");
    expect(mini).toMatchObject({
      id: "gateway:openai/gpt-5-mini",
      providerId: "gateway",
      group: "openai",
      chatCapable: true,
    });
    expect(models.find((model) => model.slug === "acme/no-tools")?.chatCapable).toBe(false);
    expect(models.find((model) => model.slug === "acme/tiny-context")?.chatCapable).toBe(false);
  });

  it("combines every configured provider and names the provider in the heading", async () => {
    vi.stubEnv("OPENAI_API_KEY", "oa-key");
    const fetchMock = stubFetch({
      [GATEWAY_URL]: () => json(gatewayPayload),
      [OPENAI_URL]: () => json(openAiPayload),
    });
    const { providers, models } = await getModelOptions();

    expect(providers.map((provider) => provider.id).sort()).toEqual(["gateway", "openai"]);
    expect(models.find((model) => model.id === "openai:gpt-4o-mini")?.group).toBe(
      "OpenAI · OpenAI",
    );
    expect(models.find((model) => model.id === "gateway:openai/gpt-5-mini")?.group).toBe(
      "Vercel AI Gateway · openai",
    );
    // OpenAI's list needs the key; the gateway's public list is sent none
    const headersFor = (url: string) => {
      const call = fetchMock.mock.calls.find(([requested]) => String(requested) === url);
      return (call?.[1] as { headers?: Record<string, string> } | undefined)?.headers;
    };
    expect(headersFor(OPENAI_URL)?.Authorization).toBe("Bearer oa-key");
    expect(headersFor(GATEWAY_URL)).toBeDefined();
    expect(headersFor(GATEWAY_URL)).not.toHaveProperty("Authorization");
  });

  it("keeps working when one provider's list fails", async () => {
    vi.stubEnv("OPENAI_API_KEY", "oa-key");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    stubFetch({
      [GATEWAY_URL]: () => json(gatewayPayload),
      [OPENAI_URL]: () => json({}, 500),
    });
    const { providers, models } = await getModelOptions();
    expect(providers.find((provider) => provider.id === "openai")?.ok).toBe(false);
    expect(providers.find((provider) => provider.id === "gateway")?.ok).toBe(true);
    expect(models.length).toBeGreaterThan(0);
    warn.mockRestore();
  });

  it("throws when keys are set and no provider's list loads", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    stubFetch({ [GATEWAY_URL]: () => json({}, 503) });
    await expect(getModelOptions()).rejects.toThrow("no provider's model list could be loaded");
    warn.mockRestore();
  });

  it("offers Fireworks' built-in list when its own list can't be fetched", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubEnv("CHAT_PROVIDER", "fireworks");
    vi.stubEnv("FIREWORKS_API_KEY", "fw-key");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    stubFetch({
      "https://api.fireworks.ai/inference/v1/models": () => json({}, 500),
    });
    const { models } = await getModelOptions();
    expect(models.map((model) => model.slug)).toContain("accounts/fireworks/models/glm-5p3-flash");
    warn.mockRestore();
  });

  it("knows whether a model is offered, and finds it by its saved value", async () => {
    stubFetch({ [GATEWAY_URL]: () => json(gatewayPayload) });
    expect(await isModelAvailable("gateway:openai/gpt-5-mini")).toBe(true);
    expect(await isModelAvailable("openai/gpt-5-mini")).toBe(true); // saved before providers had names
    expect(await isModelAvailable("gateway:openai/text-embedding-x")).toBe(false);
    expect(await isModelAvailable("openai:gpt-4o-mini")).toBe(false); // OpenAI has no key
    expect((await findModelOption("gateway:acme/no-tools"))?.chatCapable).toBe(false);
  });

  it("falls back to the default when a model has left the list, but keeps it through an outage", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    stubFetch({ [GATEWAY_URL]: () => json(gatewayPayload) });
    expect(await usableModelRef("gateway:openai/gpt-5-mini")).toBe("gateway:openai/gpt-5-mini");
    expect(await usableModelRef("gateway:gone/model")).toBe("chat");
    expect(await usableModelRef("chat")).toBe("chat");
    expect(await usableModelRef(undefined)).toBe("chat");

    resetModelCatalogs();
    stubFetch({ [GATEWAY_URL]: () => json({}, 503) });
    expect(await usableModelRef("gateway:openai/gpt-5-mini")).toBe("gateway:openai/gpt-5-mini");
    warn.mockRestore();
  });
});
