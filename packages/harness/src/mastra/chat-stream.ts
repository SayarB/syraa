import { randomUUID } from "node:crypto";
import { toAISdkStream } from "@mastra/ai-sdk";
import type { MemoryItem } from "@syraa/memory";
import { createUIMessageStream, type UIMessage } from "ai";
import { runWithChatContext } from "../chat-run-context.js";
import { buildTurnInstructions } from "../turn-instructions.js";
import { getSyraaAgent } from "./index.js";
import {
  resolveTurnFromStreamOutput,
  type SyraaTurnMeta,
  stripRuntimeFooters,
} from "./resolve-turn.js";

export type { SyraaTurnMeta };

export async function createSyraaUIMessageStream(opts: {
  userId: string;
  threadId: string;
  userMessage: string;
  memoryItems: MemoryItem[];
  onTurnComplete: (turn: SyraaTurnMeta) => Promise<Record<string, unknown> | undefined>;
}) {
  return runWithChatContext({ userId: opts.userId, threadId: opts.threadId }, async () => {
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
      instructions: await buildTurnInstructions(opts.userId, opts.memoryItems),
      maxSteps: 50,
      modelSettings: {
        temperature: 0.4,
        maxOutputTokens: 2048,
      },
    });

    return createUIMessageStream({
      originalMessages: [userMessage],
      execute: async ({ writer }) => {
        // Collect every streamed text delta: after a tool step Mastra's `result.text` is only
        // the last step's text, not the whole reply the user saw.
        let streamedText = "";
        for await (const part of toAISdkStream(result, {
          from: "agent",
          version: "v7",
        })) {
          if (part.type === "text-delta") streamedText += part.delta;
          await writer.write(part);
        }

        // Nothing visible was streamed (or only a footer): stream the resolved fallback.
        const agentText = stripRuntimeFooters(streamedText);
        const turn = await resolveTurnFromStreamOutput({ text: streamedText });
        const message = turn.message.trim();

        if (message && !agentText) {
          const textId = randomUUID();
          await writer.write({ type: "text-start", id: textId });
          await writer.write({
            type: "text-delta",
            id: textId,
            delta: message,
          });
          await writer.write({ type: "text-end", id: textId });
        }

        const meta = await opts.onTurnComplete(turn);
        if (meta) {
          await writer.write({
            type: "data-syraa-turn",
            data: meta,
          });
        }
      },
    });
  });
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
