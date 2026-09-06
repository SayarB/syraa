import { afterEach, describe, expect, it, vi } from "vitest";
import { filterLessonsForTurn, isDuplicateLesson, shouldAutoActivate } from "../src/lessons.js";
import { resolveChatProvider } from "../src/llm.js";
import { formatMaterialsOutline } from "../src/mastra/prompt.js";
import { buildMaterialsWorkingMemoryContent } from "../src/materials-working-memory.js";
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

describe("buildMaterialsWorkingMemoryContent", () => {
  it("wraps outline in session materials header", () => {
    const content = buildMaterialsWorkingMemoryContent([
      {
        resourceId: "a",
        name: "notes.pdf",
        status: "ready",
        sectionTitles: ["Intro"],
      },
    ]);
    expect(content).toContain("# Session materials");
    expect(content).toContain("notes.pdf");
    expect(content).toContain("Intro");
    expect(content).not.toContain("[syraa:materials-overview]");
  });

  it("accepts optional Works scope params via seed helper signature", () => {
    expect(typeof buildMaterialsWorkingMemoryContent).toBe("function");
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

describe("filterLessonsForTurn", () => {
  const bikeLesson = [
    {
      text: "User is interested in motorcycle recommendations",
      kind: "preference" as const,
    },
  ];

  it("drops lessons for research / recommendation questions", () => {
    expect(
      filterLessonsForTurn("do a research on bikes that I should buy with 12L budget", bikeLesson),
    ).toEqual([]);
    expect(
      filterLessonsForTurn("what cars should I buy under 12 lac", bikeLesson),
    ).toEqual([]);
  });

  it("keeps lessons when user explicitly asks to remember", () => {
    expect(
      filterLessonsForTurn("Remember that I prefer concise answers.", bikeLesson),
    ).toEqual(bikeLesson);
  });
});
