import { AsyncLocalStorage } from "node:async_hooks";

export type ChatRunContext = {
  userId: string;
  threadId: string;
  projectId?: string | null;
  subprojectId?: string | null;
};

const storage = new AsyncLocalStorage<ChatRunContext>();

export function runWithChatContext<T>(ctx: ChatRunContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}

export function getChatRunContext(): ChatRunContext {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error("Chat tools require an active chat run context");
  }
  return ctx;
}
