import type { ServerResponse } from "node:http";
import type { MemoryItem } from "@syraa/memory";
import { pipeUIMessageStreamToResponse } from "ai";
import { type GatedLesson, gateLesson } from "./lesson-gate.js";
import { applyLessons } from "./lessons.js";
import { runChatTurn } from "./llm.js";
import { createStaticUIMessageStream, createSyraaUIMessageStream } from "./mastra/chat-stream.js";
import { failSpan, startChatTurnSpan } from "./mastra/observability.js";
import { getMemory, listMemoryForUser, parseSaveCommand, saveMemoryItem } from "./memory.js";
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
  lessons?: GatedLesson[];
};

export async function handleChat(request: ChatRequest): Promise<ChatResponse> {
  const prepared = await prepareChatTurn(request, "generate");

  if (prepared.kind === "static") {
    return {
      role: "assistant",
      threadId: prepared.threadId,
      content: prepared.content,
      memoryItems: prepared.memoryItems,
    };
  }

  let turn: Awaited<ReturnType<typeof runChatTurn>>;
  try {
    turn = await runChatTurn({
      userId: request.userId,
      threadId: prepared.threadId,
      userMessage: prepared.message,
      memoryItems: prepared.activeItems,
      turnSpan: prepared.turnSpan,
    });
  } catch (error) {
    failSpan(prepared.turnSpan, error);
    throw error;
  }

  const { memoryItems, lessons } = await finishTurn(request, prepared);
  prepared.turnSpan?.end({ output: turn.message });

  return {
    role: "assistant",
    threadId: prepared.threadId,
    content: turn.message,
    model: turn.model,
    provider: turn.provider,
    memoryItems,
    lessons,
  };
}

/**
 * Post-reply bookkeeping (thread title, lessons). Best effort: the reply is already produced, so a
 * failure here is logged and the turn still completes with no new memory items.
 */
async function finishTurn(
  request: ChatRequest,
  prepared: Extract<Awaited<ReturnType<typeof prepareChatTurn>>, { kind: "turn" }>,
): Promise<{ memoryItems: MemoryItem[]; lessons: GatedLesson[] }> {
  try {
    await maybeSetThreadTitle({
      userId: request.userId,
      threadId: prepared.threadId,
      title: prepared.message,
    });
  } catch (error) {
    console.warn("[chat] thread title not set:", error instanceof Error ? error.message : error);
  }

  const lessons = await prepared.lessonGate;
  try {
    const memoryItems = await applyLessons(prepared.service, {
      userId: request.userId,
      memoryId: prepared.memoryId,
      lessons,
      messageId: request.messageId,
      existingItems: prepared.dedupItems,
    });
    return { memoryItems, lessons };
  } catch (error) {
    console.warn("[chat] lessons not saved:", error instanceof Error ? error.message : error);
    return { memoryItems: [], lessons };
  }
}

async function prepareChatTurn(request: ChatRequest, mode: "stream" | "generate") {
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

  // One Langfuse trace per turn (undefined when tracing is off); the agent and lesson gate nest under it.
  // Started last, so nothing above can fail and leave it open.
  const turnSpan = startChatTurnSpan({
    userId: request.userId,
    threadId,
    userMessage: message,
    mode,
    messageId: request.messageId,
    projectId: request.projectId,
    subprojectId: request.subprojectId,
  });

  // Started now, awaited after the reply — runs in parallel with the chat model. Never rejects.
  const lessonGate = gateLesson({
    userId: request.userId,
    threadId,
    userMessage: message,
    parentSpan: turnSpan,
  });

  return {
    kind: "turn" as const,
    service,
    threadId,
    message,
    memoryId: memory.id,
    activeItems,
    items,
    dedupItems,
    lessonGate,
    turnSpan,
  };
}

export async function pipeChatStream(request: ChatRequest, res: ServerResponse): Promise<void> {
  const prepared = await prepareChatTurn(request, "stream");

  if (prepared.kind === "static") {
    const stream = createStaticUIMessageStream(prepared.content);
    await pipeUIMessageStreamToResponse({ response: res, stream });
    return;
  }

  let stream: Awaited<ReturnType<typeof createSyraaUIMessageStream>>;
  try {
    stream = await createSyraaUIMessageStream({
      userId: request.userId,
      threadId: prepared.threadId,
      userMessage: prepared.message,
      memoryItems: prepared.activeItems,
      turnSpan: prepared.turnSpan,
      onTurnComplete: async (turn) => {
        const { memoryItems, lessons } = await finishTurn(request, prepared);
        prepared.turnSpan?.end({ output: turn.message });

        return {
          threadId: prepared.threadId,
          memoryItems,
          lessons,
          displayMessage: turn.message,
        };
      },
    });
  } catch (error) {
    failSpan(prepared.turnSpan, error);
    throw error;
  }

  await pipeUIMessageStreamToResponse({ response: res, stream });
}

export async function closeHarness(): Promise<void> {
  const { shutdownObservability } = await import("./mastra/index.js");
  const { closeMastraStorage } = await import("./mastra/storage.js");
  const { closeContextAndQueue } = await import("./context.js");
  const handle = await getMemory().catch(() => null);
  if (handle) await handle.close();
  await closeContextAndQueue();
  await shutdownObservability();
  await closeMastraStorage();
}
