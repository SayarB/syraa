import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  configuredProviders,
  formatModelRef,
  normaliseModelRef,
  parseModelRef,
  providerCredentials,
  selectModel,
} from "../src/providers/index.js";

beforeEach(() => {
  vi.stubEnv("CHAT_PROVIDER", "gateway");
  vi.stubEnv("AI_GATEWAY_API_KEY", "gw-key");
  vi.stubEnv("AI_GATEWAY_BASE_URL", "");
  vi.stubEnv("AI_GATEWAY_MODEL", "");
  vi.stubEnv("FIREWORKS_API_KEY", "");
  vi.stubEnv("OPENAI_API_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("model refs", () => {
  it("round-trips a slug with slashes, including the gateway's `maker/model` form", () => {
    const ref = formatModelRef("gateway", "openai/gpt-5-mini");
    expect(ref).toBe("gateway:openai/gpt-5-mini");
    expect(parseModelRef(ref)).toEqual({ providerId: "gateway", slug: "openai/gpt-5-mini" });
    expect(parseModelRef("fireworks:accounts/fireworks/models/glm-5p3-flash")).toEqual({
      providerId: "fireworks",
      slug: "accounts/fireworks/models/glm-5p3-flash",
    });
  });

  it("splits on the first colon only, so a slug may contain one", () => {
    expect(parseModelRef("gateway:vendor/model:free")).toEqual({
      providerId: "gateway",
      slug: "vendor/model:free",
    });
  });

  it("means the server default for 'chat' or nothing", () => {
    expect(parseModelRef("chat")).toBeNull();
    expect(parseModelRef(undefined)).toBeNull();
    expect(parseModelRef("")).toBeNull();
  });

  it("reads a value with no provider prefix as a model on the default provider", () => {
    expect(parseModelRef("openai/gpt-5-mini")).toEqual({
      providerId: "gateway",
      slug: "openai/gpt-5-mini",
    });
    // "foo" is not a provider, so the whole value is the slug
    expect(parseModelRef("foo:bar")).toEqual({ providerId: "gateway", slug: "foo:bar" });
    vi.stubEnv("CHAT_PROVIDER", "openai");
    expect(parseModelRef("gpt-4o-mini")).toEqual({ providerId: "openai", slug: "gpt-4o-mini" });
  });

  it("normalises stored values to the current format", () => {
    expect(normaliseModelRef("chat")).toBe("chat");
    expect(normaliseModelRef("openai/gpt-5-mini")).toBe("gateway:openai/gpt-5-mini");
    expect(normaliseModelRef("openai:gpt-4o-mini")).toBe("openai:gpt-4o-mini");
  });
});

describe("providerCredentials", () => {
  it("needs a key, and takes the base URL from the environment or the provider's default", () => {
    expect(providerCredentials("openai")).toBeNull();
    expect(providerCredentials("gateway")).toEqual({
      apiKey: "gw-key",
      baseUrl: "https://ai-gateway.vercel.sh/v1",
    });
    vi.stubEnv("AI_GATEWAY_BASE_URL", "https://proxy.test/v1/");
    expect(providerCredentials("gateway")?.baseUrl).toBe("https://proxy.test/v1");
  });

  it("lists the providers that have a key", () => {
    expect(configuredProviders()).toEqual(["gateway"]);
    vi.stubEnv("OPENAI_API_KEY", "oa-key");
    expect(configuredProviders().sort()).toEqual(["gateway", "openai"]);
  });
});

describe("selectModel", () => {
  it("calls the chosen model with its own provider's credentials", () => {
    vi.stubEnv("OPENAI_API_KEY", "oa-key");
    expect(selectModel("gateway:anthropic/claude-haiku-x")).toEqual({
      providerId: "gateway",
      slug: "anthropic/claude-haiku-x",
      config: {
        id: "vercel/anthropic/claude-haiku-x",
        url: "https://ai-gateway.vercel.sh/v1",
        apiKey: "gw-key",
      },
    });
    expect(selectModel("openai:gpt-4o-mini")).toMatchObject({
      providerId: "openai",
      slug: "gpt-4o-mini",
      config: { url: "https://api.openai.com/v1", apiKey: "oa-key" },
    });
  });

  it("gives the server's default model for 'chat' or nothing", () => {
    expect(selectModel("chat")).toMatchObject({
      providerId: "gateway",
      slug: "openai/gpt-oss-120b",
    });
    expect(selectModel(undefined)).toMatchObject({ providerId: "gateway" });
  });

  it("falls back to the default rather than failing when the chosen provider has no key", () => {
    expect(selectModel("openai:gpt-4o-mini")).toMatchObject({
      providerId: "gateway",
      slug: "openai/gpt-oss-120b",
    });
  });
});
