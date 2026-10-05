import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const generate = vi.fn();
vi.mock("../src/mastra/index.js", () => ({
  getTitleWriterAgent: () => ({ generate }),
}));

const { titleModelConfig } = await import("../src/mastra/agents/title-writer.js");
const { getSyraaMemory } = await import("../src/mastra/memory.js");
const { closeMastraStorage, ensureMastraStorageReady } = await import("../src/mastra/storage.js");
const { closeSettingsStore, ensureSettingsReady, updateUserSettings } = await import(
  "../src/settings.js"
);
const { backfillThreadTitles, cleanGeneratedTitle, generateThreadTitle, nameNewThread } =
  await import("../src/thread-titles.js");
const { isUntitledThread, titleSourceOf } = await import("../src/threads.js");

const GLM_FLASH = "accounts/fireworks/models/glm-5p3-flash";

describe("cleanGeneratedTitle", () => {
  it("keeps a plain title", () => {
    expect(cleanGeneratedTitle("Slow Postgres lateral join")).toBe("Slow Postgres lateral join");
  });

  it("strips quotes, labels, markdown and trailing punctuation", () => {
    expect(cleanGeneratedTitle('"Debugging a slow query."')).toBe("Debugging a slow query");
    expect(cleanGeneratedTitle("Title: Trip planning for Goa")).toBe("Trip planning for Goa");
    expect(cleanGeneratedTitle("**Weekly meal plan**")).toBe("Weekly meal plan");
    expect(cleanGeneratedTitle("“Résumé feedback”")).toBe("Résumé feedback");
  });

  it("uses the first non-empty line", () => {
    expect(cleanGeneratedTitle("\n\nBudget review\nHere is why…")).toBe("Budget review");
  });

  it("returns null for empty output and shortens very long output", () => {
    expect(cleanGeneratedTitle("   \n ")).toBeNull();
    expect(cleanGeneratedTitle('""')).toBeNull();
    const long = cleanGeneratedTitle("word ".repeat(40)) ?? "";
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("thread title helpers", () => {
  it("treats Mastra's placeholder as untitled", () => {
    expect(isUntitledThread("New Thread 2026-10-05T10:00:00.000Z")).toBe(true);
    expect(isUntitledThread("Trip planning")).toBe(false);
  });

  it("reads the title source, treating legacy threads as fallback", () => {
    expect(titleSourceOf(undefined)).toBe("fallback");
    expect(titleSourceOf({ placement: "global" })).toBe("fallback");
    expect(titleSourceOf({ titleSource: "generated" })).toBe("generated");
    expect(titleSourceOf({ titleSource: "user" })).toBe("user");
  });
});

describe("titleModelConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reuses the chat model for the default setting", () => {
    vi.stubEnv("CHAT_PROVIDER", "fireworks");
    vi.stubEnv("FIREWORKS_API_KEY", "fw-key");
    vi.stubEnv("FIREWORKS_MODEL", "");
    const config = titleModelConfig("chat") as { id: string };
    expect(config.id).toBe("fireworks-ai/accounts/fireworks/models/gpt-oss-120b");
  });

  it("points a chosen model at the chat provider's endpoint and key", () => {
    vi.stubEnv("CHAT_PROVIDER", "fireworks");
    vi.stubEnv("FIREWORKS_API_KEY", "fw-key");
    const config = titleModelConfig(GLM_FLASH) as { id: string; url: string; apiKey: string };
    expect(config).toEqual({
      id: `fireworks-ai/${GLM_FLASH}`,
      url: "https://api.fireworks.ai/inference/v1",
      apiKey: "fw-key",
    });
  });
});

describe("generateThreadTitle", () => {
  afterEach(() => {
    generate.mockReset();
  });

  it("passes the title model through the request context and cleans the output", async () => {
    generate.mockResolvedValue({ text: '"Trip planning for Goa."' });
    const title = await generateThreadTitle({
      messages: [{ role: "user", text: "help me plan a trip to goa" }],
      titleModel: GLM_FLASH,
    });
    expect(title).toBe("Trip planning for Goa");
    const [prompt, options] = generate.mock.calls[0];
    expect(prompt).toBe("User: help me plan a trip to goa");
    expect(options.requestContext.get("titleModel")).toBe(GLM_FLASH);
  });

  it("does not call the model without a user message", async () => {
    expect(
      await generateThreadTitle({
        messages: [{ role: "assistant", text: "hi" }],
        titleModel: "chat",
      }),
    ).toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });
});

describe.skipIf(!process.env.DATABASE_URL)("thread titles (Postgres)", () => {
  const userId = `titles-test-${randomUUID()}`;
  const createdThreadIds: string[] = [];

  async function makeThread(title: string | undefined, titleSource?: string) {
    const memory = getSyraaMemory();
    const thread = await memory.createThread({
      resourceId: userId,
      title,
      metadata: titleSource ? { titleSource } : {},
    });
    createdThreadIds.push(thread.id);
    await memory.saveMessages({
      messages: [
        {
          id: randomUUID(),
          threadId: thread.id,
          resourceId: userId,
          role: "user",
          createdAt: new Date(),
          content: { format: 2, parts: [{ type: "text", text: `first message of ${title}` }] },
        },
      ],
    });
    return (await memory.getThreadById({ threadId: thread.id })) ?? thread;
  }

  beforeAll(async () => {
    vi.stubEnv("CHAT_PROVIDER", "fireworks");
    await ensureMastraStorageReady();
    await ensureSettingsReady();
  });

  afterEach(() => {
    generate.mockReset();
  });

  afterAll(async () => {
    const memory = getSyraaMemory();
    for (const threadId of createdThreadIds) await memory.deleteThread(threadId);
    vi.unstubAllEnvs();
    await closeSettingsStore();
    await closeMastraStorage();
  });

  it("backfills only fallback titles, with the owner's model, keeping updatedAt", async () => {
    await updateUserSettings(userId, { titleModel: GLM_FLASH });
    const legacy = await makeThread("can you help me figure out why my postgres query is slow");
    const generated = await makeThread("Already generated", "generated");
    const renamed = await makeThread("My own name", "user");
    generate.mockResolvedValue({ text: "Slow Postgres query" });

    const result = await backfillThreadTitles({ userId });

    expect(result).toEqual({ scanned: 3, retitled: 1, skipped: 2, failed: 0 });
    expect(generate.mock.calls[0][1].requestContext.get("titleModel")).toBe(GLM_FLASH);
    const memory = getSyraaMemory();
    const after = await memory.getThreadById({ threadId: legacy.id });
    expect(after?.title).toBe("Slow Postgres query");
    expect(titleSourceOf(after?.metadata)).toBe("generated");
    expect(new Date(after?.updatedAt ?? 0).getTime()).toBe(new Date(legacy.updatedAt).getTime());
    expect((await memory.getThreadById({ threadId: generated.id }))?.title).toBe(
      "Already generated",
    );
    expect((await memory.getThreadById({ threadId: renamed.id }))?.title).toBe("My own name");

    generate.mockClear();
    const rerun = await backfillThreadTitles({ userId });
    expect(rerun.retitled).toBe(0);
    expect(generate).not.toHaveBeenCalled();
  });

  it("dry run changes nothing", async () => {
    const legacy = await makeThread("plan my week");
    generate.mockResolvedValue({ text: "Weekly plan" });
    await backfillThreadTitles({ userId, dryRun: true });
    expect((await getSyraaMemory().getThreadById({ threadId: legacy.id }))?.title).toBe(
      "plan my week",
    );
  });

  it("names a new thread, falling back to the first message", async () => {
    const memory = getSyraaMemory();
    const first = await memory.createThread({ resourceId: userId, metadata: {} });
    const second = await memory.createThread({ resourceId: userId, metadata: {} });
    createdThreadIds.push(first.id, second.id);

    const named = await nameNewThread({
      userId,
      threadId: first.id,
      userMessage: "what's a good recipe for dal",
      generated: Promise.resolve("Dal recipe ideas"),
    });
    expect(named).toBe("Dal recipe ideas");
    const firstAfter = await memory.getThreadById({ threadId: first.id });
    expect(titleSourceOf(firstAfter?.metadata)).toBe("generated");

    const fallback = await nameNewThread({
      userId,
      threadId: second.id,
      userMessage: "what's a good recipe for dal",
      generated: Promise.resolve(null),
    });
    expect(fallback).toBe("what's a good recipe for dal");
    const secondAfter = await memory.getThreadById({ threadId: second.id });
    expect(titleSourceOf(secondAfter?.metadata)).toBe("fallback");

    // Already titled: left alone.
    const again = await nameNewThread({
      userId,
      threadId: first.id,
      userMessage: "another",
      generated: Promise.resolve("Something else"),
    });
    expect(again).toBeNull();
    expect((await memory.getThreadById({ threadId: first.id }))?.title).toBe("Dal recipe ideas");
  });
});
