import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGatewayModelCatalog,
  EXPENSIVE_INPUT_PER_MILLION,
  getModelOptions,
  isModelAvailable,
  parseGatewayModels,
} from "../src/model-options.js";

const payload = {
  data: [
    {
      id: "openai/gpt-5-mini",
      name: "GPT-5 mini",
      type: "language",
      owned_by: "openai",
      pricing: { input: "0.00000025", output: "0.000002" },
    },
    {
      id: "anthropic/claude-opus-x",
      name: "Claude Opus X",
      type: "language",
      owned_by: "anthropic",
      pricing: { input: "0.000015", output: "0.000075" },
    },
    {
      id: "anthropic/claude-haiku-x",
      type: "language",
      owned_by: "anthropic",
      pricing: { input: "0.0000008", output: "0.000004" },
    },
    { id: "openai/text-embedding-x", name: "Embedding", type: "embedding", owned_by: "openai" },
    { id: "bfl/image-x", name: "Image", type: "image", owned_by: "bfl" },
    { name: "no id", type: "language" },
    "garbage",
    null,
  ],
};

describe("parseGatewayModels", () => {
  const models = parseGatewayModels(payload);

  it("keeps only language models and skips malformed entries", () => {
    expect(models.map((model) => model.id).sort()).toEqual([
      "anthropic/claude-haiku-x",
      "anthropic/claude-opus-x",
      "openai/gpt-5-mini",
    ]);
  });

  it("sorts by provider, then name, and falls back to the id for a missing name", () => {
    expect(models.map((model) => model.label)).toEqual([
      "anthropic/claude-haiku-x",
      "Claude Opus X",
      "GPT-5 mini",
    ]);
  });

  it("turns per-token prices into dollars per million tokens", () => {
    const mini = models.find((model) => model.id === "openai/gpt-5-mini");
    expect(mini?.inputPerMillion).toBeCloseTo(0.25);
    expect(mini?.outputPerMillion).toBeCloseTo(2);
  });

  it("flags only the expensive ones", () => {
    const flagged = models.filter((model) => model.expensive).map((model) => model.id);
    expect(flagged).toEqual(["anthropic/claude-opus-x"]);
    expect(EXPENSIVE_INPUT_PER_MILLION).toBe(3);
  });

  it("returns an empty list for a payload that isn't a model list", () => {
    expect(parseGatewayModels(null)).toEqual([]);
    expect(parseGatewayModels({ data: "nope" })).toEqual([]);
    expect(parseGatewayModels({})).toEqual([]);
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("gateway model catalog", () => {
  const url = () => "https://gateway.test/v1/models";

  it("fetches once and serves the cached list until it expires", async () => {
    let time = 0;
    const fetchFn = vi.fn(async () => jsonResponse(payload));
    const catalog = createGatewayModelCatalog({ fetchFn, url, ttlMs: 1000, now: () => time });

    expect(await catalog.list()).toHaveLength(3);
    time = 999;
    await catalog.list();
    expect(fetchFn).toHaveBeenCalledTimes(1);

    time = 1000;
    await catalog.list();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("sends one request for several callers at once, with no credentials", async () => {
    const fetchFn = vi.fn(async (_url: unknown, _init?: unknown) => jsonResponse(payload));
    const catalog = createGatewayModelCatalog({ fetchFn, url });
    await Promise.all([catalog.list(), catalog.list(), catalog.list()]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const init = fetchFn.mock.calls[0][1] as { headers: Record<string, string> };
    expect(Object.keys(init.headers)).toEqual(["Accept"]);
  });

  it("serves the last good list when a refresh fails", async () => {
    let time = 0;
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(payload))
      .mockResolvedValueOnce(jsonResponse({}, 503));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const catalog = createGatewayModelCatalog({ fetchFn, url, ttlMs: 1000, now: () => time });

    await catalog.list();
    time = 5000;
    expect(await catalog.list()).toHaveLength(3);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("throws when there is nothing cached and the fetch fails or returns no models", async () => {
    const failing = createGatewayModelCatalog({
      fetchFn: async () => jsonResponse({}, 500),
      url,
    });
    await expect(failing.list()).rejects.toThrow("HTTP 500");

    const empty = createGatewayModelCatalog({
      fetchFn: async () => jsonResponse({ data: [] }),
      url,
    });
    await expect(empty.list()).rejects.toThrow("empty");
  });

  it("retries on the next call after a failure", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse(payload));
    const catalog = createGatewayModelCatalog({ fetchFn, url });
    await expect(catalog.list()).rejects.toThrow();
    expect(await catalog.list()).toHaveLength(3);
  });
});

describe("getModelOptions on the gateway", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("lists the gateway's language models and knows which slugs are offered", async () => {
    vi.stubEnv("CHAT_PROVIDER", "gateway");
    vi.stubEnv("AI_GATEWAY_BASE_URL", "https://gateway.test/v1");
    const fetchMock = vi.fn(async () => jsonResponse(payload));
    vi.stubGlobal("fetch", fetchMock);

    const { provider, models } = await getModelOptions();
    expect(provider).toBe("gateway");
    expect(models).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledWith("https://gateway.test/v1/models", expect.anything());

    expect(await isModelAvailable("openai/gpt-5-mini")).toBe(true);
    expect(await isModelAvailable("openai/text-embedding-x")).toBe(false);
    expect(await isModelAvailable("nope/nope")).toBe(false);
  });
});
