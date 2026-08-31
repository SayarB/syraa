import { afterEach, describe, expect, it, vi } from "vitest";
import { shouldAutoActivate } from "../src/lessons.js";
import { resolveChatProvider } from "../src/llm.js";
import { formatMaterialsOutline } from "../src/mastra/prompt.js";
import { parseSaveCommand } from "../src/memory.js";
import { chatRequestSchema, createThreadRequestSchema } from "../src/schemas.js";
import {
  buildThreadWorksMetadata,
  isUntitledThread,
  truncateThreadTitle,
} from "../src/threads.js";

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

describe("formatMaterialsOutline", () => {
  it("lists file names and first-layer sections", () => {
    const text = formatMaterialsOutline([
      {
        resourceId: "a",
        name: "report.pdf",
        status: "ready",
        sectionTitles: ["I. Introduction", "II. Methods"],
      },
    ]);
    expect(text).toContain("report.pdf");
    expect(text).toContain("I. Introduction");
    expect(text).toContain("II. Methods");
  });

  it("handles empty materials", () => {
    expect(formatMaterialsOutline([])).toBe("No ingested materials yet.");
  });
});

describe("chatRequestSchema (Mastra thread)", () => {
  it("accepts threadId without history", () => {
    const parsed = chatRequestSchema.safeParse({
      message: "hello",
      threadId: "thread-1",
      userId: "demo-user",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.threadId).toBe("thread-1");
      expect(parsed.data.history).toBeUndefined();
    }
  });

  it("accepts message-only (server creates thread)", () => {
    const parsed = chatRequestSchema.safeParse({ message: "hello" });
    expect(parsed.success).toBe(true);
  });

  it("accepts optional Works ids for forward-compat", () => {
    const parsed = chatRequestSchema.safeParse({
      message: "hello",
      projectId: "proj-1",
      subprojectId: null,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.projectId).toBe("proj-1");
      expect(parsed.data.subprojectId).toBeNull();
    }
  });
});

describe("buildThreadWorksMetadata", () => {
  it("defaults to global placement", () => {
    expect(buildThreadWorksMetadata()).toEqual({
      placement: "global",
      projectId: null,
      subprojectId: null,
    });
  });

  it("marks attached when work ids present", () => {
    expect(buildThreadWorksMetadata({ projectId: "p1", subprojectId: "s1" })).toEqual({
      placement: "attached",
      projectId: "p1",
      subprojectId: "s1",
    });
  });
});

describe("thread titles", () => {
  it("treats empty and New chat as untitled", () => {
    expect(isUntitledThread("")).toBe(true);
    expect(isUntitledThread("New chat")).toBe(true);
    expect(isUntitledThread("hey")).toBe(false);
  });

  it("truncates long titles", () => {
    expect(truncateThreadTitle("hello world", 5)).toBe("hell…");
  });
});

describe("createThreadRequestSchema", () => {
  it("accepts empty body (server fills userId)", () => {
    expect(createThreadRequestSchema.safeParse({}).success).toBe(true);
  });

  it("accepts Works filter fields", () => {
    const parsed = createThreadRequestSchema.safeParse({
      projectId: "proj",
      subprojectId: null,
      title: "Biology plan",
    });
    expect(parsed.success).toBe(true);
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
