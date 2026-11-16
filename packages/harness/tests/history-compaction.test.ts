import {
  type CompactionState,
  emptyCompactionState,
  type RecalledMessage,
  resolveCompactionConfig,
} from "@syraa/history";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompactionStateStore } from "../src/history-state.js";

const isModelAvailable = vi.fn();
vi.mock("../src/model-options.js", () => ({
  isModelAvailable: (...args: unknown[]) => isModelAvailable(...args),
}));

const { compactIfEnabled, compactThreadHistory, summaryModelFor } = await import(
  "../src/history-compaction.js"
);

const config = resolveCompactionConfig(); // n=3, k=4

/** `turns` turns of one user and one assistant message, numbered like the real thread. */
function messages(turns: number): RecalledMessage[] {
  return Array.from({ length: turns * 2 }, (_, i) => ({
    id: `m${i + 1}`,
    position: i + 1,
    role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
    text: `${i % 2 === 0 ? "question" : "answer"} ${Math.floor(i / 2) + 1}`,
  }));
}

function memoryStore(initial: CompactionState | null = null) {
  let current = initial;
  const saves: { rev: number; expectedRev: number }[] = [];
  const store: CompactionStateStore = {
    load: async () => current,
    save: async (_user, _thread, state, expectedRev) => {
      if ((current?.rev ?? 0) !== expectedRev) return false;
      saves.push({ rev: state.rev, expectedRev });
      current = state;
      return true;
    },
    remove: async () => undefined,
  };
  return {
    store,
    saves,
    get state() {
      return current;
    },
  };
}

function fakeSummarizer() {
  return {
    summarizeChunk: vi.fn(async (_prompt: string) =>
      JSON.stringify({ detail: "A fuller summary.", short: "Brief." }),
    ),
    mergeNote: vi.fn(async (_prompt: string) => "Merged overview."),
  };
}

const run = (
  turns: number,
  deps: ReturnType<typeof memoryStore>,
  summarizer = fakeSummarizer(),
  maxJobs?: number,
) =>
  compactThreadHistory({
    userId: "u1",
    threadId: "t1",
    config,
    maxJobs,
    store: deps.store,
    summarizer,
    loadMessages: async () => messages(turns),
  });

describe("compactThreadHistory", () => {
  it("does nothing for a short thread", async () => {
    const deps = memoryStore();
    const summarizer = fakeSummarizer();
    const result = await run(6, deps, summarizer);
    expect(result.jobs).toBe(0);
    expect(summarizer.summarizeChunk).not.toHaveBeenCalled();
    expect(deps.saves).toEqual([]);
  });

  it("summarises each aged chunk from its own raw messages, once, saving after every step", async () => {
    const deps = memoryStore();
    const summarizer = fakeSummarizer();
    // 14 turns: the newest 3 stay as they are; turns 0–7 (two chunks of 4) are summarised
    const result = await run(14, deps, summarizer);

    expect(result.jobs).toBe(2);
    expect(summarizer.summarizeChunk).toHaveBeenCalledTimes(2);
    const firstPrompt = summarizer.summarizeChunk.mock.calls[0][0];
    expect(firstPrompt).toContain("question 1");
    expect(firstPrompt).toContain("answer 4");
    expect(firstPrompt).not.toContain("question 5");
    expect(summarizer.summarizeChunk.mock.calls[1][0]).toContain("question 5");

    expect(deps.saves).toEqual([
      { rev: 1, expectedRev: 0 },
      { rev: 2, expectedRev: 1 },
    ]);
    expect(result.state.chunks.map((c) => [c.fromPos, c.toPos, c.fromId, c.toId])).toEqual([
      [1, 8, "m1", "m8"],
      [9, 16, "m9", "m16"],
    ]);
    expect(result.state.summarizedTurns).toBe(8);
    expect(result.state.chunks[0].detail).toBe("A fuller summary.");
    expect(result.state.chunks[0].short).toBe("Brief.");
  });

  it("is idempotent: a second run on the same thread finds nothing to do", async () => {
    const deps = memoryStore();
    await run(14, deps);
    const summarizer = fakeSummarizer();
    expect((await run(14, deps, summarizer)).jobs).toBe(0);
    expect(summarizer.summarizeChunk).not.toHaveBeenCalled();
  });

  it("catches a long thread up a few chunks at a time, then folds old chunks into the epoch note", async () => {
    const deps = memoryStore();
    const summarizer = fakeSummarizer();
    // 40 turns → boundary 36 → 9 chunks; the first run is capped at 3 model calls
    expect((await run(40, deps, summarizer, 3)).jobs).toBe(3);
    expect(deps.state?.summarizedTurns).toBe(12);

    for (let i = 0; i < 10; i++) await run(40, deps, summarizer, 3);
    expect(deps.state?.summarizedTurns).toBe(36);
    expect(deps.state?.chunks.length).toBeLessThanOrEqual(5);
    expect(deps.state?.epoch?.text).toBe("Merged overview.");
    expect(summarizer.mergeNote).toHaveBeenCalled();
    // the merge prompt carries the oldest chunk's short summary
    expect(summarizer.mergeNote.mock.calls[0][0]).toContain("Brief.");
  });

  it("stops without overwriting when another run saved first", async () => {
    const deps = memoryStore();
    const racing: CompactionStateStore = {
      ...deps.store,
      save: async () => false,
    };
    const summarizer = fakeSummarizer();
    const result = await compactThreadHistory({
      userId: "u1",
      threadId: "t1",
      config,
      store: racing,
      summarizer,
      loadMessages: async () => messages(14),
    });
    expect(result.jobs).toBe(0);
    expect(summarizer.summarizeChunk).toHaveBeenCalledTimes(1);
  });

  it("leaves the state alone when the summariser fails or returns nothing", async () => {
    const deps = memoryStore();
    const failing = fakeSummarizer();
    failing.summarizeChunk.mockRejectedValueOnce(new Error("model down"));
    await expect(run(14, deps, failing)).rejects.toThrow("model down");
    expect(deps.saves).toEqual([]);

    const empty = fakeSummarizer();
    empty.summarizeChunk.mockResolvedValue("   ");
    await expect(run(14, deps, empty)).rejects.toThrow("empty summary");
    expect(deps.state).toBeNull();
  });

  it("starts from stored state rather than from scratch", async () => {
    const deps = memoryStore();
    await run(14, deps, fakeSummarizer());
    const stored = deps.state as CompactionState;
    expect(stored.rev).toBe(2);

    const resumed = memoryStore(stored);
    const summarizer = fakeSummarizer();
    // two more chunks' worth of turns arrive
    const result = await run(22, resumed, summarizer);
    expect(result.jobs).toBe(2);
    expect(result.state.summarizedTurns).toBe(16);
    expect(summarizer.summarizeChunk.mock.calls[0][0]).toContain("question 9");
    expect(emptyCompactionState().rev).toBe(0);
  });
});

describe("the user's settings", () => {
  const settings = (over: Record<string, unknown>) => async () =>
    ({
      titleModel: "chat",
      historyCompaction: true,
      historySummaryModel: "chat",
      ...over,
    }) as never;

  beforeEach(() => {
    isModelAvailable.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("does nothing for a user who turned compaction off", async () => {
    const compact = vi.fn();
    const result = await compactIfEnabled(
      { userId: "u1", threadId: "t1" },
      { getSettings: settings({ historyCompaction: false }), compact },
    );
    expect(result).toEqual({ ran: false });
    expect(compact).not.toHaveBeenCalled();
  });

  it("runs with the model the user chose", async () => {
    isModelAvailable.mockResolvedValue(true);
    const compact = vi.fn(async () => ({ jobs: 0, state: emptyCompactionState() }));
    const result = await compactIfEnabled(
      { userId: "u1", threadId: "t1" },
      { getSettings: settings({ historySummaryModel: "openai/gpt-5-mini" }), compact },
    );
    expect(result).toEqual({ ran: true, model: "openai/gpt-5-mini" });
    expect(compact).toHaveBeenCalledWith({
      userId: "u1",
      threadId: "t1",
      model: "openai/gpt-5-mini",
    });
  });

  it("uses the chat model when the chosen one has left the list or the list can't be read", async () => {
    isModelAvailable.mockResolvedValueOnce(false);
    expect(await summaryModelFor("gone/model")).toBe("chat");

    isModelAvailable.mockRejectedValueOnce(new Error("gateway down"));
    expect(await summaryModelFor("openai/gpt-5-mini")).toBe("chat");

    expect(await summaryModelFor("chat")).toBe("chat");
    expect(isModelAvailable).toHaveBeenCalledTimes(2); // "chat" needs no lookup
  });
});
