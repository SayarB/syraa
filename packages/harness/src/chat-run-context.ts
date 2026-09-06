import { AsyncLocalStorage } from "node:async_hooks";

export type ChatRunContext = {
  userId: string;
  threadId: string;
  projectId?: string | null;
  subprojectId?: string | null;
  /** Per-turn tool results for turn-end fallback only. */
  toolCallCache?: Map<string, unknown>;
};

const storage = new AsyncLocalStorage<ChatRunContext>();

export function runWithChatContext<T>(
  ctx: Omit<ChatRunContext, "toolCallCache">,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run({ ...ctx, toolCallCache: new Map() }, fn);
}

export function getChatRunContext(): ChatRunContext {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error("Chat tools require an active chat run context");
  }
  return ctx;
}
