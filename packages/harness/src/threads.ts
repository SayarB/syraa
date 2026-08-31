import type { MastraDBMessage } from "@mastra/core/agent";
import { getSyraaMemory } from "./mastra/memory.js";
import { ValidationError } from "./schemas.js";

/** Thread metadata shaped for future Works (Project → Subproject → sessions). */
export type ThreadWorksMetadata = {
  placement: "global" | "attached";
  projectId: string | null;
  subprojectId: string | null;
};

export type ThreadDto = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  placement: "global" | "attached";
  projectId: string | null;
  subprojectId: string | null;
};

export type ThreadMessageDto = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export function buildThreadWorksMetadata(opts?: {
  projectId?: string | null;
  subprojectId?: string | null;
}): ThreadWorksMetadata {
  const projectId = opts?.projectId ?? null;
  const subprojectId = opts?.subprojectId ?? null;
  return {
    placement: projectId || subprojectId ? "attached" : "global",
    projectId,
    subprojectId,
  };
}

function metadataFromThread(metadata?: Record<string, unknown>): ThreadWorksMetadata {
  return {
    placement: (metadata?.placement as ThreadWorksMetadata["placement"] | undefined) ?? "global",
    projectId: (metadata?.projectId as string | null | undefined) ?? null,
    subprojectId: (metadata?.subprojectId as string | null | undefined) ?? null,
  };
}

function toIso(value: Date | string | undefined): string {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

export function isUntitledThread(title?: string | null): boolean {
  const trimmed = title?.trim() ?? "";
  return trimmed.length === 0 || trimmed === "New chat";
}

export function truncateThreadTitle(text: string, max = 72): string {
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trimEnd()}…`;
}

function toThreadDto(thread: {
  id: string;
  title?: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  metadata?: Record<string, unknown>;
}): ThreadDto {
  const meta = metadataFromThread(thread.metadata);
  return {
    id: thread.id,
    title: isUntitledThread(thread.title) ? "Chat" : (thread.title as string).trim(),
    createdAt: toIso(thread.createdAt),
    updatedAt: toIso(thread.updatedAt),
    ...meta,
  };
}

/**
 * Resolve or create a Mastra chat thread for `userId` (resource).
 * Does not create Works entities — only stores optional ids on thread metadata.
 */
export async function ensureChatThread(opts: {
  userId: string;
  threadId?: string;
  projectId?: string | null;
  subprojectId?: string | null;
}): Promise<{ threadId: string; created: boolean; metadata: ThreadWorksMetadata }> {
  const memory = getSyraaMemory();
  const metadata = buildThreadWorksMetadata({
    projectId: opts.projectId,
    subprojectId: opts.subprojectId,
  });

  if (opts.threadId) {
    const existing = await memory.getThreadById({
      threadId: opts.threadId,
      resourceId: opts.userId,
    });
    if (existing) {
      if (existing.resourceId && existing.resourceId !== opts.userId) {
        throw new ValidationError("thread does not belong to this user");
      }
      return {
        threadId: existing.id,
        created: false,
        metadata: metadataFromThread(existing.metadata),
      };
    }

    const created = await memory.createThread({
      threadId: opts.threadId,
      resourceId: opts.userId,
      metadata,
    });
    return { threadId: created.id, created: true, metadata };
  }

  const created = await memory.createThread({
    resourceId: opts.userId,
    metadata,
  });
  return { threadId: created.id, created: true, metadata };
}

export async function createChatThread(opts: {
  userId: string;
  projectId?: string | null;
  subprojectId?: string | null;
  title?: string;
}): Promise<ThreadDto> {
  const memory = getSyraaMemory();
  const metadata = buildThreadWorksMetadata({
    projectId: opts.projectId,
    subprojectId: opts.subprojectId,
  });
  const created = await memory.createThread({
    resourceId: opts.userId,
    title: opts.title,
    metadata,
  });
  return toThreadDto(created);
}

async function firstUserMessageTitle(threadId: string, resourceId: string): Promise<string | null> {
  const memory = getSyraaMemory();
  const recalled = await memory.recall({
    threadId,
    resourceId,
    perPage: 40,
    orderBy: { field: "createdAt", direction: "ASC" },
  });

  for (const message of recalled.messages) {
    if (message.role !== "user") continue;
    const text = extractDisplayText(message);
    if (text) return truncateThreadTitle(text);
  }
  return null;
}

export async function listChatThreads(opts: {
  userId: string;
  projectId?: string | null;
  subprojectId?: string | null;
}): Promise<ThreadDto[]> {
  const memory = getSyraaMemory();
  const metadataFilter: Record<string, unknown> = {};
  if (opts.projectId) metadataFilter.projectId = opts.projectId;
  if (opts.subprojectId) metadataFilter.subprojectId = opts.subprojectId;

  const result = await memory.listThreads({
    perPage: false,
    orderBy: { field: "updatedAt", direction: "DESC" },
    filter: {
      resourceId: opts.userId,
      ...(Object.keys(metadataFilter).length > 0 ? { metadata: metadataFilter } : {}),
    },
  });

  const threads: ThreadDto[] = [];
  for (const thread of result.threads) {
    let title = thread.title?.trim() ?? "";
    if (isUntitledThread(title)) {
      const derived = await firstUserMessageTitle(thread.id, thread.resourceId);
      title = derived ?? "Chat";
      if (derived) {
        try {
          await memory.updateThread({
            id: thread.id,
            title: derived,
            metadata: thread.metadata ?? {},
          });
        } catch {
          // listing still shows derived title even if persist fails
        }
      }
    }
    threads.push(toThreadDto({ ...thread, title }));
  }

  return threads;
}

/** Best-effort title from first user message when thread still untitled. */
export async function maybeSetThreadTitle(opts: {
  userId: string;
  threadId: string;
  title: string;
}): Promise<void> {
  const memory = getSyraaMemory();
  const thread = await memory.getThreadById({
    threadId: opts.threadId,
    resourceId: opts.userId,
  });
  if (!thread || !isUntitledThread(thread.title)) return;

  const title = truncateThreadTitle(opts.title) || "Chat";
  try {
    await memory.updateThread({
      id: opts.threadId,
      title,
      metadata: thread.metadata ?? {},
    });
  } catch {
    await memory.saveThread({
      thread: {
        ...thread,
        title,
        updatedAt: new Date(),
      },
    });
  }
}

function extractDisplayText(message: MastraDBMessage): string | null {
  if (message.role !== "user" && message.role !== "assistant") return null;

  const parts = message.content?.parts ?? [];
  const texts: string[] = [];
  for (const part of parts) {
    if (
      part &&
      typeof part === "object" &&
      "type" in part &&
      part.type === "text" &&
      "text" in part &&
      typeof part.text === "string"
    ) {
      texts.push(part.text);
    }
  }

  let raw =
    texts.join("\n").trim() ||
    (typeof message.content?.content === "string" ? message.content.content.trim() : "");
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { message?: unknown };
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message.trim();
    }
  } catch {
    // plain text
  }

  return raw;
}

export async function listThreadMessages(opts: {
  userId: string;
  threadId: string;
}): Promise<{ thread: ThreadDto; messages: ThreadMessageDto[] }> {
  const memory = getSyraaMemory();
  const thread = await memory.getThreadById({
    threadId: opts.threadId,
    resourceId: opts.userId,
  });
  if (!thread || (thread.resourceId && thread.resourceId !== opts.userId)) {
    throw new ValidationError("thread not found");
  }

  const recalled = await memory.recall({
    threadId: opts.threadId,
    resourceId: opts.userId,
    perPage: false,
  });

  const messages: ThreadMessageDto[] = [];
  for (const message of recalled.messages) {
    const content = extractDisplayText(message);
    if (!content) continue;
    if (message.role !== "user" && message.role !== "assistant") continue;
    messages.push({
      id: message.id,
      role: message.role,
      content,
      createdAt: toIso(message.createdAt),
    });
  }

  return { thread: toThreadDto(thread), messages };
}
