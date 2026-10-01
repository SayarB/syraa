import { afterEach, describe, expect, it, vi } from "vitest";
import { isDuplicateLesson } from "../src/lessons.js";
import { resolveChatProvider } from "../src/llm.js";
import { formatMaterialsOutline } from "../src/mastra/prompt.js";
import { parseSaveCommand } from "../src/memory.js";
import { chatRequestSchema, createThreadRequestSchema } from "../src/schemas.js";
import { buildThreadWorksMetadata, isUntitledThread, truncateThreadTitle } from "../src/threads.js";

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
  const material = (name: string, summary: string | null, sectionTitles: string[] = []) => ({
    resourceId: name,
    name,
    status: "ready" as const,
    sectionTitles,
    summary,
  });

  it("lists each document with its summary, not its sections", () => {
    const text = formatMaterialsOutline([
      material("report.pdf", "A survey of solar adoption.", ["I. Introduction", "II. Methods"]),
    ]);
    expect(text).toBe("- report.pdf — A survey of solar adoption.");
  });

  it("falls back to the first few sections when there is no summary", () => {
    const titles = ["A", "B", "C", "D", "E", "F", "G"];
    const text = formatMaterialsOutline([material("notes.pdf", null, titles)]);
    expect(text).toBe("- notes.pdf — sections: A; B; C; D; E (+2 more)");
  });

  it("caps the overview and points at list_materials", () => {
    const docs = Array.from({ length: 50 }, (_, i) => material(`doc-${i}.pdf`, "x".repeat(600)));
    const text = formatMaterialsOutline(docs);
    expect(text.length).toBeLessThanOrEqual(12_000 + 60);
    expect(text).toMatch(/… \d+ more documents — call list_materials$/);
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
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.threadId).toBe("thread-1");
      expect(parsed.data.history).toBeUndefined();
    }
  });

  it("does not use body userId for identity", () => {
    const parsed = chatRequestSchema.safeParse({
      message: "hello",
      userId: "spoofed",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect("userId" in parsed.data).toBe(false);
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
  it("accepts empty body (session supplies userId)", () => {
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

describe("lesson deduplication", () => {
  it("treats paraphrased preferences as duplicates", () => {
    const existing = [{ text: "User prefers concise answers", status: "active" }] as const;
    expect(isDuplicateLesson([...existing], "Prefers concise answers")).toBe(true);
    expect(isDuplicateLesson([...existing], "User prefers concise answers.")).toBe(true);
  });

  it("treats paraphrased trigger-response rules as duplicates", () => {
    const existing = [
      {
        text: 'When user says "sun suna", respond with "aati kya khandala"',
        status: "active",
      },
    ] as const;
    expect(
      isDuplicateLesson(
        [...existing],
        'When the user says "sun suna", respond with "aati kya khandala".',
      ),
    ).toBe(true);
  });

  it("allows clearly different lessons", () => {
    const existing = [{ text: "User prefers concise answers", status: "active" }] as const;
    expect(
      isDuplicateLesson(
        [...existing],
        "When providing prices, always convert to INR using same-day rates.",
      ),
    ).toBe(false);
  });
});
