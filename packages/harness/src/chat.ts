import { applyLessons } from "./lessons.js";
import { runChatTurn } from "./llm.js";
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
  lessons?: Awaited<ReturnType<typeof runChatTurn>>["lessons"];
};

export async function handleChat(request: ChatRequest): Promise<ChatResponse> {
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
      role: "assistant",
      threadId,
      content: [
        "Chat normally — conversation history is stored on the server (Mastra thread).",
        "Product Memory is refreshed each turn; materials overview returns in a later phase.",
        "Durable facts land in Memory (pending ones need your confirmation).",
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
      role: "assistant",
      threadId,
      content: `Saved ${item.type}: “${item.text}”`,
      memoryItems: [item],
    };
  }

  const { memory, items } = await listMemoryForUser(service, request.userId);
  const activeItems = items.filter((item) => item.status === "active");

  const turn = await runChatTurn({
    userId: request.userId,
    threadId,
    userMessage: message,
    memoryItems: activeItems,
  });

  await maybeSetThreadTitle({
    userId: request.userId,
    threadId,
    title: message,
  });

  const memoryItems = await applyLessons(service, {
    userId: request.userId,
    memoryId: memory.id,
    lessons: turn.lessons,
    userMessage: message,
    messageId: request.messageId,
    existingItems: items,
  });

  return {
    role: "assistant",
    threadId,
    content: turn.message,
    model: turn.model,
    provider: turn.provider,
    memoryItems,
    lessons: turn.lessons,
  };
}

export async function closeHarness(): Promise<void> {
  const { closeMastraStorage } = await import("./mastra/storage.js");
  const { closeContextAndQueue } = await import("./context.js");
  const handle = await getMemory().catch(() => null);
  if (handle) await handle.close();
  await closeContextAndQueue();
  await closeMastraStorage();
}
