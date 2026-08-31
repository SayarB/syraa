import { applyLessons } from "./lessons.js";
import { runChatTurn } from "./llm.js";
import { getMemory, listMemoryForUser, parseSaveCommand, saveMemoryItem } from "./memory.js";
import type { ChatMessage } from "./schemas.js";

export type ChatRequest = {
  userId: string;
  message: string;
  messageId?: string;
  history?: ChatMessage[];
};

export type ChatResponse = {
  role: "assistant";
  content: string;
  model?: string;
  provider?: string;
  memoryItems?: Awaited<ReturnType<typeof applyLessons>>;
  lessons?: Awaited<ReturnType<typeof runChatTurn>>["lessons"];
};

export async function handleChat(request: ChatRequest): Promise<ChatResponse> {
  const { service } = await getMemory();
  const message = request.message.trim();
  const history = request.history ?? [];

  if (message === "/help") {
    return {
      role: "assistant",
      content: [
        "Chat normally — the model picks up preferences and rules from conversation.",
        "Durable facts land in Memory (pending ones need your confirmation).",
        "",
        "Manual overrides still work:",
        "  /rule <text>  /pref <text>  /method <text>  /decision <text>",
      ].join("\n"),
    };
  }

  const command = parseSaveCommand(message);
  if (command) {
    const item = await saveMemoryItem(service, request.userId, command, request.messageId);
    return {
      role: "assistant",
      content: `Saved ${item.type}: “${item.text}”`,
      memoryItems: [item],
    };
  }

  const { memory, items } = await listMemoryForUser(service, request.userId);
  const activeItems = items.filter((item) => item.status === "active");

  const turn = await runChatTurn({
    userMessage: message,
    history,
    memoryItems: activeItems,
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
    content: turn.message,
    model: turn.model,
    provider: turn.provider,
    memoryItems,
    lessons: turn.lessons,
  };
}

export async function closeHarness(): Promise<void> {
  const { closeContextAndQueue } = await import("./context.js");
  const handle = await getMemory().catch(() => null);
  if (handle) await handle.close();
  await closeContextAndQueue();
}
