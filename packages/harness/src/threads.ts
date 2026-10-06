import type { MastraDBMessage } from "@mastra/core/agent";
import { getHarnessPool } from "./db.js";
import { getSyraaMemory } from "./mastra/memory.js";
import { ValidationError } from "./schemas.js";
import { mastraThreadToUiMessages, type ThreadUiMessageDto } from "./thread-ui-messages.js";

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

export type ThreadMessageDto = ThreadUiMessageDto;

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
  // "New Thread <iso date>" is Mastra's placeholder for threads it creates itself.
  return trimmed.length === 0 || trimmed === "New chat" || trimmed.startsWith("New Thread ");
}

/**
 * Where a thread's title came from, kept in thread metadata as `titleSource`.
 * - "generated": written by the title model; never replaced automatically.
 * - "fallback": the first message, shortened (title model failed, or a legacy thread).
 * - "user": set by the user; never replaced automatically.
 */
export type TitleSource = "generated" | "fallback" | "user";

/** Threads titled before `titleSource` existed count as "fallback": their title is the first message. */
export function titleSourceOf(metadata?: Record<string, unknown>): TitleSource {
  const source = metadata?.titleSource;
  return source === "generated" || source === "user" ? source : "fallback";
}

export function truncateThreadTitle(text: string, max = THREAD_TITLE_MAX_CHARS): string {
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
}): Promise<{
  threadId: string;
  created: boolean;
  /** True while the thread has no title yet, so this turn should name it. */
  needsTitle: boolean;
  metadata: ThreadWorksMetadata;
}> {
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
        needsTitle: isUntitledThread(existing.title),
        metadata: metadataFromThread(existing.metadata),
      };
    }

    const created = await memory.createThread({
      threadId: opts.threadId,
      resourceId: opts.userId,
      metadata,
    });
    return { threadId: created.id, created: true, needsTitle: true, metadata };
  }

  const created = await memory.createThread({
    resourceId: opts.userId,
    metadata,
  });
  return { threadId: created.id, created: true, needsTitle: true, metadata };
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

export type ThreadTextMessage = { role: "user" | "assistant"; text: string };

/** The thread's first `limit` user/assistant messages as plain text, oldest first. */
export async function openingThreadMessages(
  threadId: string,
  resourceId: string,
  limit = 4,
): Promise<ThreadTextMessage[]> {
  const memory = getSyraaMemory();
  const recalled = await memory.recall({
    threadId,
    resourceId,
    perPage: 40,
    orderBy: { field: "createdAt", direction: "ASC" },
  });

  const messages: ThreadTextMessage[] = [];
  for (const message of recalled.messages) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    const text = extractDisplayText(message);
    if (text) messages.push({ role: message.role, text });
    if (messages.length >= limit) break;
  }
  return messages;
}

async function firstUserMessageTitle(threadId: string, resourceId: string): Promise<string | null> {
  const opening = await openingThreadMessages(threadId, resourceId);
  const firstUser = opening.find((message) => message.role === "user");
  return firstUser ? truncateThreadTitle(firstUser.text) : null;
}

/** Newest assistant reply in the thread (for the lesson gate): its last 2,000 chars, where offers like "want me to always…?" sit. */
export async function lastAssistantMessageText(opts: {
  userId: string;
  threadId: string;
}): Promise<string | null> {
  const memory = getSyraaMemory();
  const recalled = await memory.recall({
    threadId: opts.threadId,
    resourceId: opts.userId,
    perPage: 6,
    orderBy: { field: "createdAt", direction: "DESC" },
  });

  // Sort here too — recall may return the page in chronological order.
  const newestFirst = recalled.messages
    .filter((message) => message.role === "assistant")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  for (const message of newestFirst) {
    const text = extractDisplayText(message);
    if (text) return text.slice(-2000);
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
      // Display only: saving here could beat the turn's generated title, which is still on its way.
      title = (await firstUserMessageTitle(thread.id, thread.resourceId)) ?? "Chat";
    }
    threads.push(toThreadDto({ ...thread, title }));
  }

  return threads;
}

export const THREAD_TITLE_MAX_CHARS = 72;

type ThreadRow = {
  id: string;
  resourceId: string;
  title: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

/**
 * Patch a thread row in place with one UPDATE on Mastra's `mastra_threads` table. Unlike Mastra's
 * `saveThread` (a full-row upsert from a possibly stale read) it never recreates a deleted thread
 * or reverts concurrent changes, and unlike `updateThread` it leaves `updatedAt` alone, so the
 * thread keeps its place in the list. Returns the updated row, or null when no row matched.
 */
export async function patchThreadRow(opts: {
  userId: string;
  threadId: string;
  title?: string;
  /** Metadata keys to set (merged into the existing metadata). */
  set?: Record<string, unknown>;
  /** Metadata keys to remove. */
  unset?: string[];
  /** Only patch while the title is missing or a fallback, never a generated or user title. */
  onlyIfFallbackTitle?: boolean;
}): Promise<ThreadRow | null> {
  const result = await getHarnessPool().query<ThreadRow>(
    `UPDATE mastra_threads
        SET title = COALESCE($3, title),
            metadata = (COALESCE(metadata, '{}'::jsonb) - $5::text[]) || $4::jsonb
      WHERE id = $1 AND "resourceId" = $2
        ${opts.onlyIfFallbackTitle ? `AND COALESCE(metadata->>'titleSource', 'fallback') = 'fallback'` : ""}
      RETURNING id, "resourceId", title, metadata,
                COALESCE("createdAtZ", "createdAt") AS "createdAt",
                COALESCE("updatedAtZ", "updatedAt") AS "updatedAt"`,
    [
      opts.threadId,
      opts.userId,
      opts.title ?? null,
      JSON.stringify(opts.set ?? {}),
      opts.unset ?? [],
    ],
  );
  return result.rows[0] ?? null;
}

/**
 * Save a thread title and where it came from, keeping `updatedAt`. With `onlyIfFallbackTitle`,
 * a generated or user-set title is left alone (returns false); the check and the write are one
 * statement, so a rename made meanwhile is never overwritten.
 */
export async function saveThreadTitle(opts: {
  userId: string;
  threadId: string;
  title: string;
  source: TitleSource;
  onlyIfFallbackTitle?: boolean;
}): Promise<boolean> {
  const row = await patchThreadRow({
    userId: opts.userId,
    threadId: opts.threadId,
    title: truncateThreadTitle(opts.title) || "Chat",
    set: { titleSource: opts.source },
    onlyIfFallbackTitle: opts.onlyIfFallbackTitle,
  });
  return row !== null;
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

  const raw =
    texts.join("\n").trim() ||
    (typeof message.content?.content === "string" ? message.content.content.trim() : "");
  if (!raw) return null;

  try {
    // Legacy `{ message, lessons }` turn JSON only — a reply that is itself JSON stays as is.
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.message === "string" &&
      parsed.message.trim() &&
      Object.keys(parsed).every((key) => key === "message" || key === "lessons")
    ) {
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

  const messages = mastraThreadToUiMessages(recalled.messages);

  return { thread: toThreadDto(thread), messages };
}
