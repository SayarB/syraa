import { Agent } from "@mastra/core/agent";
import { InMemoryStore } from "@mastra/core/storage";
import { Memory } from "@mastra/memory";
import {
  applyChunk,
  type CompactionState,
  emptyCompactionState,
  resolveCompactionConfig,
} from "@syraa/history";
import { convertArrayToReadableStream, MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import { runWithChatContext } from "../src/chat-run-context.js";
import { HistoryCompactionProcessor } from "../src/mastra/history-compaction-processor.js";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

/** A model that answers "ok" and records every prompt it was sent. */
function recordingModel() {
  const prompts: unknown[][] = [];
  const model = new MockLanguageModelV3({
    doStream: async (options) => {
      prompts.push(options.prompt as unknown[]);
      return {
        stream: convertArrayToReadableStream([
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "t1" },
          { type: "text-delta", id: "t1", delta: "ok" },
          { type: "text-end", id: "t1" },
          { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
        ]),
      };
    },
  });
  return { model, prompts };
}

type PromptMessage = { role: string; content: unknown };

function textOf(message: PromptMessage): string {
  if (typeof message.content === "string") return message.content;
  return (message.content as { type: string; text?: string }[])
    .map((part) => (part.type === "text" ? (part.text ?? "") : ""))
    .join("");
}

/** A thread of `turns` question/answer pairs with ids m1, m2, … and texts "question N" / "answer N". */
async function seededMemory(turns: number, answerText = (n: number) => `answer ${n}`) {
  const memory = new Memory({ storage: new InMemoryStore(), options: { lastMessages: 400 } });
  await memory.createThread({ threadId: "t1", resourceId: "u1", title: "t" });
  const start = Date.parse("2026-11-16T10:00:00Z");
  await memory.saveMessages({
    messages: Array.from({ length: turns * 2 }, (_, i) => ({
      id: `m${i + 1}`,
      threadId: "t1",
      resourceId: "u1",
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      createdAt: new Date(start + i * 1000),
      content: {
        format: 2 as const,
        parts: [
          {
            type: "text" as const,
            text: i % 2 === 0 ? `question ${i / 2 + 1}` : answerText((i - 1) / 2 + 1),
          },
        ],
      },
    })),
  });
  return memory;
}

function stateCovering(chunks: number): CompactionState {
  let state = emptyCompactionState(new Date(0));
  for (let c = 0; c < chunks; c++) {
    state = applyChunk(state, {
      index: c,
      fromTurn: c * 4,
      toTurn: c * 4 + 3,
      fromPos: c * 8 + 1,
      toPos: c * 8 + 8,
      fromId: `m${c * 8 + 1}`,
      toId: `m${c * 8 + 8}`,
      detail: `DETAIL-SUMMARY-${c}`,
      short: `SHORT-SUMMARY-${c}`,
    });
  }
  return state;
}

async function sendTurn(opts: {
  memory: Memory;
  processor: HistoryCompactionProcessor;
  inChatRun?: boolean;
  message?: string;
}) {
  const { model, prompts } = recordingModel();
  const agent = new Agent({
    id: "compaction-test",
    name: "compaction-test",
    instructions: "BASE INSTRUCTIONS",
    model,
    memory: opts.memory,
    inputProcessors: [opts.processor],
  });
  const go = async () => {
    const result = await agent.stream(opts.message ?? "new question", {
      memory: { thread: "t1", resource: "u1" },
    });
    await result.consumeStream();
  };
  await (opts.inChatRun === false
    ? go()
    : runWithChatContext({ userId: "u1", threadId: "t1" }, go));
  const prompt = prompts[0] as PromptMessage[];
  return {
    prompt,
    systems: prompt.filter((m) => m.role === "system").map(textOf),
    conversation: prompt.filter((m) => m.role !== "system").map(textOf),
  };
}

async function storedTexts(memory: Memory): Promise<string[]> {
  const { messages } = await memory.recall({
    threadId: "t1",
    resourceId: "u1",
    perPage: false,
    orderBy: { field: "createdAt", direction: "ASC" },
  });
  return messages.map((m) =>
    (m.content.parts ?? []).map((p) => (p.type === "text" ? p.text : "")).join(""),
  );
}

const config = resolveCompactionConfig();

describe("HistoryCompactionProcessor", () => {
  it("sends summaries for old turns and the newest turns as written", async () => {
    const memory = await seededMemory(12); // 24 messages; chunks cover m1–m16
    const processor = new HistoryCompactionProcessor({
      config,
      enabled: () => true,
      loadState: async () => stateCovering(2),
    });
    const { systems, conversation } = await sendTurn({ memory, processor });

    const summary = systems.find((text) => text.includes("DETAIL-SUMMARY-1")) as string;
    expect(summary).toBeDefined();
    expect(summary).toContain("DETAIL-SUMMARY-0"); // both chunks are still young enough for the fuller summary
    expect(summary).toContain("<untrusted_tool_result");
    expect(summary).toContain("Messages 1–8");
    expect(summary).toContain("Messages 9–16");
    expect(systems[0]).toContain("BASE INSTRUCTIONS");

    // m1–m16 (turns 1–8) are replaced; turns 9–12 and the new question go as written
    for (let turn = 1; turn <= 8; turn++) {
      expect(conversation).not.toContain(`question ${turn}`);
      expect(conversation).not.toContain(`answer ${turn}`);
    }
    expect(conversation).toEqual([
      "question 9",
      "answer 9",
      "question 10",
      "answer 10",
      "question 11",
      "answer 11",
      "question 12",
      "answer 12",
      "new question",
    ]);
  });

  it("never changes what is stored", async () => {
    const memory = await seededMemory(12, (n) => `answer ${n} ${"detail ".repeat(400)}`);
    const before = await storedTexts(memory);
    const processor = new HistoryCompactionProcessor({
      config: resolveCompactionConfig({ budgets: { verbatim: 500 } }), // forces the fallback trim too
      enabled: () => true,
      loadState: async () => stateCovering(1),
    });
    await sendTurn({ memory, processor });

    const after = await storedTexts(memory);
    // the new question and the reply were added; every earlier message is exactly as it was
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after).toHaveLength(before.length + 2);
  });

  it("falls back to shortening old turns when there are no summaries yet", async () => {
    const memory = await seededMemory(10, (n) => `answer ${n} ${"lots of words ".repeat(300)}`);
    const processor = new HistoryCompactionProcessor({
      config: resolveCompactionConfig({ budgets: { verbatim: 5500 } }),
      enabled: () => true,
      loadState: async () => null,
    });
    const { conversation, systems } = await sendTurn({ memory, processor });

    expect(systems.some((text) => text.includes("summaris"))).toBe(false);
    const full = (turn: number) =>
      conversation.find((text) => text.startsWith(`answer ${turn} `)) as string | undefined;
    // newest three turns are never touched
    for (const turn of [8, 9, 10]) expect(full(turn)?.length).toBeGreaterThan(3000);
    // the oldest turn that is still sent has been cut short
    const oldest = conversation.find((text) => text.startsWith("answer ")) as string;
    expect(oldest.length).toBeLessThan(700);
    expect(oldest.endsWith("[…]")).toBe(true);
  });

  it("does nothing outside a chat run or when switched off", async () => {
    const memory = await seededMemory(12);
    const state = stateCovering(2);
    const outside = await sendTurn({
      memory,
      inChatRun: false,
      processor: new HistoryCompactionProcessor({
        config,
        enabled: () => true,
        loadState: async () => state,
      }),
    });
    expect(outside.conversation).toHaveLength(25);
    expect(outside.systems).toEqual(["BASE INSTRUCTIONS"]);

    const off = await sendTurn({
      memory: await seededMemory(12),
      processor: new HistoryCompactionProcessor({
        config,
        enabled: () => false,
        loadState: async () => state,
      }),
    });
    expect(off.conversation).toHaveLength(25);
  });

  it("carries on with the fallback if the summaries can't be read", async () => {
    const memory = await seededMemory(6);
    const processor = new HistoryCompactionProcessor({
      config,
      enabled: () => true,
      loadState: async () => {
        throw new Error("database unavailable");
      },
    });
    const { conversation } = await sendTurn({ memory, processor });
    expect(conversation).toHaveLength(13);
    expect(conversation.at(-1)).toBe("new question");
  });
});
