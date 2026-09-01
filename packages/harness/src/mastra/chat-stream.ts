import { randomUUID } from "node:crypto";
import type { MemoryItem } from "@syraa/memory";
import { toAISdkStream } from "@mastra/ai-sdk";
import { createUIMessageStream, type UIMessage } from "ai";
import { runWithChatContext } from "../chat-run-context.js";
import { getSyraaAgent } from "./index.js";
import { buildSystemPrompt } from "./prompt.js";
import { resolveTurnFromStreamOutput, type SyraaTurnMeta } from "./resolve-turn.js";
import { buildStructuredTurnOutput } from "./structured-turn.js";

export type { SyraaTurnMeta };

export async function createSyraaUIMessageStream(opts: {
  userId: string;
  threadId: string;
  userMessage: string;
  memoryItems: MemoryItem[];
  onTurnComplete: (turn: SyraaTurnMeta) => Promise<Record<string, unknown> | undefined>;
}) {
  return runWithChatContext(
    { userId: opts.userId, threadId: opts.threadId },
    async () => {
      const agent = getSyraaAgent();
      const userMessage: UIMessage = {
        id: randomUUID(),
        role: "user",
        parts: [{ type: "text", text: opts.userMessage }],
      };

      const result = await agent.stream([userMessage], {
        memory: {
          thread: opts.threadId,
          resource: opts.userId,
        },
        instructions: buildSystemPrompt(opts.memoryItems),
        structuredOutput: buildStructuredTurnOutput(),
        maxSteps: 8,
        modelSettings: {
          temperature: 0.4,
          maxOutputTokens: 2048,
        },
      });

      return createUIMessageStream({
        originalMessages: [userMessage],
        execute: async ({ writer }) => {
          for await (const part of toAISdkStream(result, {
            from: "agent",
            version: "v7",
          })) {
            await writer.write(part);
          }

          const turn = await resolveTurnFromStreamOutput(result);
          const meta = await opts.onTurnComplete(turn);
          if (meta) {
            await writer.write({
              type: "data-syraa-turn",
              data: meta,
            });
          }
        },
      });
    },
  );
}

export function createStaticUIMessageStream(content: string) {
  const textId = randomUUID();
  return createUIMessageStream({
    execute: async ({ writer }) => {
      writer.write({ type: "start" });
      writer.write({ type: "text-start", id: textId });
      writer.write({ type: "text-delta", id: textId, delta: content });
      writer.write({ type: "text-end", id: textId });
      writer.write({ type: "finish" });
    },
  });
}
