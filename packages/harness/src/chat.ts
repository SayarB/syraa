import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import { pipeUIMessageStreamToResponse } from "ai";
import { applyLessons } from "./lessons.js";
import { runChatTurn } from "./llm.js";
import { getMemory, listMemoryForUser, parseSaveCommand, saveMemoryItem } from "./memory.js";
import {
  createStaticUIMessageStream,
  createSyraaUIMessageStream,
} from "./mastra/chat-stream.js";
import { ensureChatThread, maybeSetThreadTitle } from "./threads.js";

export type ChatRequest = {
  userId: string;
  message: string;
  messageId?: string;
  threadId?: string;
  projectId?: string | null;
  subprojectId?: string | null;
};

export type ChatResponse = {
  role: "assistant";
  content: string;
  threadId: string;
  model?: string;
  provider?: string;
  memoryItems?: Awaited<ReturnType<typeof applyLessons>>;
  lessons?: Awaited<ReturnType<typeof runChatTurn>>["lessons"];
};

export async function handleChat(request: ChatRequest): Promise<ChatResponse> {
  const prepared = await prepareChatTurn(request);

  if (prepared.kind === "static") {
    return {
      role: "assistant",
      threadId: prepared.threadId,
      content: prepared.content,
      memoryItems: prepared.memoryItems,
    };
  }

  const turn = await runChatTurn({
    userId: request.userId,
    threadId: prepared.threadId,
    userMessage: prepared.message,
    memoryItems: prepared.activeItems,
  });

  await maybeSetThreadTitle({
    userId: request.userId,
    threadId: prepared.threadId,
    title: prepared.message,
  });

  const memoryItems = await applyLessons(prepared.service, {
    userId: request.userId,
    memoryId: prepared.memoryId,
    lessons: turn.lessons,
    userMessage: prepared.message,
    messageId: request.messageId,
    existingItems: prepared.dedupItems,
  });

  return {
    role: "assistant",
    threadId: prepared.threadId,
    content: turn.message,
    model: turn.model,
    provider: turn.provider,
    memoryItems,
    lessons: turn.lessons,
  };
}

async function prepareChatTurn(request: ChatRequest) {
  const { service } = await getMemory();
  const message = request.message.trim();

  const { threadId } = await ensureChatThread({
    userId: request.userId,
    threadId: request.threadId,
    projectId: request.projectId,
    subprojectId: request.subprojectId,
  });

  if (message === "/help") {
    return {
      kind: "static" as const,
      threadId,
      content: [
        "Chat normally — conversation history and materials overview are stored on the server (Mastra thread).",
        "Product Memory is refreshed each turn.",
        "Durable facts land in Memory (pending ones need your confirmation).",
        "The agent can read ingested materials via tools when you ask about document content.",
        "",
        "Manual overrides:",
        "  /rule <text>  /pref <text>  /method <text>  /decision <text>",
      ].join("\n"),
    };
  }

  const command = parseSaveCommand(message);
  if (command) {
    const item = await saveMemoryItem(service, request.userId, command, request.messageId);
    return {
      kind: "static" as const,
      threadId,
      content: `Saved ${item.type}: “${item.text}”`,
      memoryItems: [item],
    };
  }

  const { memory, items, dedupItems } = await listMemoryForUser(service, request.userId);
  const activeItems = items.filter((item) => item.status === "active");

  return {
    kind: "turn" as const,
    service,
    threadId,
    message,
    memoryId: memory.id,
    activeItems,
    items,
    dedupItems,
  };
}

export async function pipeChatStream(request: ChatRequest, res: ServerResponse): Promise<void> {
  const prepared = await prepareChatTurn(request);

  if (prepared.kind === "static") {
    const stream = createStaticUIMessageStream(prepared.content);
    await pipeUIMessageStreamToResponse({ response: res, stream });
    return;
  }

  const stream = await createSyraaUIMessageStream({
    userId: request.userId,
    threadId: prepared.threadId,
    userMessage: prepared.message,
    memoryItems: prepared.activeItems,
    onTurnComplete: async (turn) => {
      await maybeSetThreadTitle({
        userId: request.userId,
        threadId: prepared.threadId,
        title: prepared.message,
      });

      const memoryItems = await applyLessons(prepared.service, {
        userId: request.userId,
        memoryId: prepared.memoryId,
        lessons: turn.lessons,
        userMessage: prepared.message,
        messageId: request.messageId,
        existingItems: prepared.dedupItems,
      });

      return {
        threadId: prepared.threadId,
        memoryItems,
        lessons: turn.lessons,
        displayMessage: turn.message,
      };
    },
  });

  await pipeUIMessageStreamToResponse({ response: res, stream });
}

export async function closeHarness(): Promise<void> {
  const { closeMastraStorage } = await import("./mastra/storage.js");
  const { closeContextAndQueue } = await import("./context.js");
  const handle = await getMemory().catch(() => null);
  if (handle) await handle.close();
  await closeContextAndQueue();
  await closeMastraStorage();
}
