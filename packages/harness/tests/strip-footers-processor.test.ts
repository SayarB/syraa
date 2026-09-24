import { Agent } from "@mastra/core/agent";
import { InMemoryStore } from "@mastra/core/storage";
import { Memory } from "@mastra/memory";
import { convertArrayToReadableStream, MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import { StripFootersProcessor } from "../src/mastra/strip-footers-processor.js";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

function replyModel(text: string) {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: text },
        { type: "text-end", id: "t1" },
        { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
      ]),
    }),
  });
}

async function savedAssistantText(withProcessor: boolean): Promise<string> {
  const memory = new Memory({ storage: new InMemoryStore(), options: { lastMessages: 10 } });
  const agent = new Agent({
    id: "footer-test",
    name: "footer-test",
    instructions: "test",
    model: replyModel("Here is the answer.\n\n---\n*Working memory updated*"),
    memory,
    ...(withProcessor ? { outputProcessors: [new StripFootersProcessor()] } : {}),
  });

  const result = await agent.stream("hi", { memory: { thread: "t1", resource: "u1" } });
  await result.consumeStream();

  const { messages } = await memory.recall({ threadId: "t1", resourceId: "u1" });
  const assistant = messages.find((m) => m.role === "assistant");
  return (assistant?.content.parts ?? [])
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");
}

describe("StripFootersProcessor", () => {
  it("keeps footers out of the message Mastra Memory saves", async () => {
    await expect(savedAssistantText(true)).resolves.toBe("Here is the answer.");
  });

  it("is what removes them (control: raw text is saved without it)", async () => {
    await expect(savedAssistantText(false)).resolves.toContain("Working memory updated");
  });
});
