import { AsyncLocalStorage } from "node:async_hooks";

export type ChatRunContext = {
  userId: string;
  threadId: string;
  projectId?: string | null;
  subprojectId?: string | null;
  /** Per-turn tool results for turn-end fallback only. */
  toolCallCache?: Map<string, unknown>;
  /** web_search calls made this turn (capped per turn). */
  webSearchCount?: number;
  /** image_search calls made this turn (capped per turn). */
  imageSearchCount?: number;
  /** web_fetch calls made this turn (capped per turn). */
  webFetchCount?: number;
  /** thread_history calls made this turn (capped per turn). */
  threadHistoryCount?: number;
  /** The user's message for this turn, so thread_history can leave the question being answered out of its results. */
  currentUserMessage?: string;
};

const storage = new AsyncLocalStorage<ChatRunContext>();

export function runWithChatContext<T>(
  ctx: Omit<ChatRunContext, "toolCallCache">,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run({ ...ctx, toolCallCache: new Map() }, fn);
}

/** The active chat run, or undefined outside one (evals and tests run the agent without it). */
export function tryGetChatRunContext(): ChatRunContext | undefined {
  return storage.getStore();
}

export function getChatRunContext(): ChatRunContext {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error("Chat tools require an active chat run context");
  }
  return ctx;
}
