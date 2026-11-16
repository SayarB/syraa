import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_USER_SETTINGS } from "../src/settings.js";

const getUserSettings = vi.fn();
vi.mock("../src/settings.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/settings.js")>()),
  getUserSettings: (...args: unknown[]) => getUserSettings(...args),
}));

const usableModelRef = vi.fn();
const listedModelFast = vi.fn();
vi.mock("../src/model-options.js", () => ({
  usableModelRef: (...args: unknown[]) => usableModelRef(...args),
  listedModelFast: (...args: unknown[]) => listedModelFast(...args),
}));

const { CHAT_MODEL_CONTEXT_KEY, chatCallSettings, chatModelConfigFor, prepareChatModel } =
  await import("../src/chat-model.js");

beforeEach(() => {
  vi.stubEnv("CHAT_PROVIDER", "gateway");
  vi.stubEnv("AI_GATEWAY_API_KEY", "gw-key");
  vi.stubEnv("AI_GATEWAY_BASE_URL", "");
  vi.stubEnv("AI_GATEWAY_MODEL", "");
  getUserSettings.mockReset().mockResolvedValue(DEFAULT_USER_SETTINGS);
  usableModelRef.mockReset().mockImplementation(async (ref: string) => ref);
  listedModelFast.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("chatCallSettings", () => {
  it("sends the usual settings when nothing is known about the model", () => {
    expect(chatCallSettings({ providerId: "gateway", threadId: "t1" })).toEqual({
      temperature: 0.4,
      maxOutputTokens: 2048,
    });
  });

  it("leaves out a temperature the model doesn't accept, but not one it merely doesn't mention", () => {
    expect(
      chatCallSettings({ providerId: "gateway", model: { temperature: false }, threadId: "t" }),
    ).not.toHaveProperty("temperature");
    expect(chatCallSettings({ providerId: "gateway", model: {}, threadId: "t" }).temperature).toBe(
      0.4,
    );
  });

  it("gives a reasoning model more output room, since it thinks before answering", () => {
    expect(
      chatCallSettings({ providerId: "gateway", model: { reasoning: true }, threadId: "t" })
        .maxOutputTokens,
    ).toBe(6144);
  });

  it("asks Fireworks to route a thread to the same prompt cache, and nobody else", () => {
    expect(chatCallSettings({ providerId: "fireworks", threadId: "t1" }).headers).toEqual({
      "x-session-affinity": "t1",
    });
    expect(chatCallSettings({ providerId: "gateway", threadId: "t1" })).not.toHaveProperty(
      "headers",
    );
    expect(chatCallSettings({ providerId: "openai", threadId: "t1" })).not.toHaveProperty(
      "headers",
    );
  });
});

describe("prepareChatModel", () => {
  it("uses the server's default model when the user chose none", async () => {
    const prepared = await prepareChatModel("u1", "t1");
    expect(prepared).toMatchObject({
      ref: "chat",
      providerId: "gateway",
      slug: "openai/gpt-oss-120b",
    });
    expect(prepared.requestContext.get(CHAT_MODEL_CONTEXT_KEY)).toBe("chat");
  });

  it("uses the user's chat model, with call settings suited to it", async () => {
    getUserSettings.mockResolvedValue({
      ...DEFAULT_USER_SETTINGS,
      chatModel: "gateway:openai/gpt-5-mini",
    });
    listedModelFast.mockResolvedValue({
      id: "openai/gpt-5-mini",
      label: "x",
      temperature: false,
      reasoning: true,
    });

    const prepared = await prepareChatModel("u1", "t1");
    expect(prepared).toMatchObject({
      ref: "gateway:openai/gpt-5-mini",
      providerId: "gateway",
      slug: "openai/gpt-5-mini",
    });
    expect(prepared.requestContext.get(CHAT_MODEL_CONTEXT_KEY)).toBe("gateway:openai/gpt-5-mini");
    expect(prepared.modelSettings).toEqual({ maxOutputTokens: 6144 });
    expect(listedModelFast).toHaveBeenCalledWith("gateway", "openai/gpt-5-mini");
  });

  it("falls back to the default model when the chosen one has left the provider's list", async () => {
    getUserSettings.mockResolvedValue({
      ...DEFAULT_USER_SETTINGS,
      chatModel: "gateway:gone/model",
    });
    usableModelRef.mockResolvedValue("chat");
    const prepared = await prepareChatModel("u1", "t1");
    expect(prepared.ref).toBe("chat");
    expect(prepared.slug).toBe("openai/gpt-oss-120b");
  });

  it("still answers, on the default model, if settings can't be read", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    getUserSettings.mockRejectedValue(new Error("database unavailable"));
    const prepared = await prepareChatModel("u1", "t1");
    expect(prepared.ref).toBe("chat");
    expect(warn).toHaveBeenCalled();
  });
});

describe("chatModelConfigFor", () => {
  const context = (ref?: string) => ({
    get: (key: string) => (key === CHAT_MODEL_CONTEXT_KEY ? ref : undefined),
  });

  it("is the model this turn chose", () => {
    expect(chatModelConfigFor(context("gateway:anthropic/claude-haiku-x"))).toEqual({
      id: "vercel/anthropic/claude-haiku-x",
      url: "https://ai-gateway.vercel.sh/v1",
      apiKey: "gw-key",
    });
  });

  it("is the server's default outside a chat turn, as in evals and tests", () => {
    const fallback = {
      id: "vercel/openai/gpt-oss-120b",
      url: "https://ai-gateway.vercel.sh/v1",
      apiKey: "gw-key",
    };
    expect(chatModelConfigFor(undefined)).toEqual(fallback);
    expect(chatModelConfigFor(context())).toEqual(fallback);
  });
});
