import { afterEach, describe, expect, it, vi } from "vitest";
import { shouldAutoActivate } from "../src/lessons.js";
import { resolveChatProvider } from "../src/llm.js";
import { parseSaveCommand } from "../src/memory.js";

describe("resolveChatProvider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prefers explicit CHAT_PROVIDER", () => {
    vi.stubEnv("CHAT_PROVIDER", "openai");
    vi.stubEnv("FIREWORKS_API_KEY", "fw");
    expect(resolveChatProvider()).toBe("openai");
  });

  it("defaults to fireworks when key is set", () => {
    vi.stubEnv("CHAT_PROVIDER", "");
    vi.stubEnv("FIREWORKS_API_KEY", "fw");
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(resolveChatProvider()).toBe("fireworks");
  });
});

describe("parseSaveCommand", () => {
  it("parses /rule shorthand", () => {
    expect(parseSaveCommand("/rule Never invent citations")).toEqual({
      type: "rule",
      text: "Never invent citations",
    });
  });

  it("returns null for normal chat", () => {
    expect(parseSaveCommand("hello there")).toBeNull();
  });
});

describe("shouldAutoActivate", () => {
  it("activates explicit rules", () => {
    expect(shouldAutoActivate({ text: "Never invent citations", kind: "rule" }, "ok")).toBe(true);
  });

  it("activates when user says always", () => {
    expect(
      shouldAutoActivate(
        { text: "Prefers concise answers", kind: "preference" },
        "Always keep replies short",
      ),
    ).toBe(true);
  });

  it("keeps inferred preferences pending", () => {
    expect(
      shouldAutoActivate(
        { text: "Might prefer bullet lists", kind: "suggestion" },
        "I sometimes like bullets",
      ),
    ).toBe(false);
  });
});
