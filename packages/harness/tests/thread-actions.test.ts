import { randomUUID } from "node:crypto";
import { createPgPool, resolveDatabaseUrl } from "@syraa/memory";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSyraaMemory } from "../src/mastra/memory.js";
import { closeMastraStorage, ensureMastraStorageReady } from "../src/mastra/storage.js";
import { threadPatchSchema } from "../src/schemas.js";
import {
  deleteChatThread,
  ensureChatThread,
  listChatThreads,
  listThreadMessages,
  ThreadNotFoundError,
  titleSourceOf,
  updateChatThread,
} from "../src/threads.js";

describe("threadPatchSchema", () => {
  it("accepts a title, archived, or both", () => {
    expect(threadPatchSchema.safeParse({ title: "Trip" }).success).toBe(true);
    expect(threadPatchSchema.safeParse({ archived: true }).success).toBe(true);
    expect(threadPatchSchema.safeParse({ title: "Trip", archived: false }).success).toBe(true);
  });

  it("rejects empty patches, blank titles and unknown keys", () => {
    expect(threadPatchSchema.safeParse({}).success).toBe(false);
    expect(threadPatchSchema.safeParse({ title: "   " }).success).toBe(false);
    expect(threadPatchSchema.safeParse({ title: "x".repeat(121) }).success).toBe(false);
    expect(threadPatchSchema.safeParse({ deleted: true }).success).toBe(false);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("thread actions (Postgres)", () => {
  const userId = `thread-actions-${randomUUID()}`;
  const otherUserId = `thread-actions-other-${randomUUID()}`;
  const createdThreadIds: string[] = [];

  async function makeThread(title: string, resourceId = userId) {
    const memory = getSyraaMemory();
    const thread = await memory.createThread({ resourceId, title, metadata: {} });
    createdThreadIds.push(thread.id);
    await memory.saveMessages({
      messages: [
        {
          id: randomUUID(),
          threadId: thread.id,
          resourceId,
          role: "user",
          createdAt: new Date(),
          content: { format: 2, parts: [{ type: "text", text: `hello from ${title}` }] },
        },
      ],
    });
    return (await memory.getThreadById({ threadId: thread.id })) ?? thread;
  }

  beforeAll(async () => {
    await ensureMastraStorageReady();
  });

  afterAll(async () => {
    const memory = getSyraaMemory();
    for (const threadId of createdThreadIds) {
      await memory.deleteThread(threadId).catch(() => undefined);
    }
    await closeMastraStorage();
  });

  it("renames a thread as a user title without moving it", async () => {
    const thread = await makeThread("old title");
    const renamed = await updateChatThread({ userId, threadId: thread.id, title: "  New name " });

    expect(renamed.title).toBe("New name");
    expect(renamed.updatedAt).toBe(new Date(thread.updatedAt).toISOString());
    const stored = await getSyraaMemory().getThreadById({ threadId: thread.id });
    expect(titleSourceOf(stored?.metadata)).toBe("user");
  });

  it("archives and unarchives, moving the thread between lists", async () => {
    const thread = await makeThread("to archive");

    const archived = await updateChatThread({ userId, threadId: thread.id, archived: true });
    expect(archived.archived).toBe(true);
    expect((await listChatThreads({ userId })).map((t) => t.id)).not.toContain(thread.id);
    expect((await listChatThreads({ userId, archived: true })).map((t) => t.id)).toContain(
      thread.id,
    );

    const restored = await updateChatThread({ userId, threadId: thread.id, archived: false });
    expect(restored.archived).toBe(false);
    expect((await listChatThreads({ userId })).map((t) => t.id)).toContain(thread.id);
    const stored = await getSyraaMemory().getThreadById({ threadId: thread.id });
    expect(stored?.metadata?.archivedAt).toBeUndefined();
  });

  it("deletes a thread and its messages permanently", async () => {
    const thread = await makeThread("to delete");
    const before = createPgPool(resolveDatabaseUrl(), { max: 1 });
    const saved = await before.query("SELECT 1 FROM mastra_messages WHERE thread_id = $1", [
      thread.id,
    ]);
    await before.end();
    expect(saved.rowCount).toBe(1);

    await deleteChatThread({ userId, threadId: thread.id });

    expect(await getSyraaMemory().getThreadById({ threadId: thread.id })).toBeNull();
    const pool = createPgPool(resolveDatabaseUrl(), { max: 1 });
    try {
      const messages = await pool.query("SELECT 1 FROM mastra_messages WHERE thread_id = $1", [
        thread.id,
      ]);
      expect(messages.rowCount).toBe(0);
    } finally {
      await pool.end();
    }
  });

  it("purges a deleted thread that a still-running reply recreated", async () => {
    const thread = await makeThread("deleted mid-reply");
    await deleteChatThread({ userId, threadId: thread.id });

    // What Mastra does when it saves a reply into a thread that no longer exists.
    const memory = getSyraaMemory();
    const recreate = () =>
      memory.saveThread({
        thread: {
          id: thread.id,
          resourceId: userId,
          title: "",
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

    await recreate();
    expect((await listChatThreads({ userId })).map((t) => t.id)).not.toContain(thread.id);
    expect(await memory.getThreadById({ threadId: thread.id })).toBeNull();

    await recreate();
    await expect(listThreadMessages({ userId, threadId: thread.id })).rejects.toBeInstanceOf(
      ThreadNotFoundError,
    );
    expect(await memory.getThreadById({ threadId: thread.id })).toBeNull();

    await recreate();
    await expect(ensureChatThread({ userId, threadId: thread.id })).rejects.toBeInstanceOf(
      ThreadNotFoundError,
    );
    expect(await memory.getThreadById({ threadId: thread.id })).toBeNull();
  });

  it("does not recreate a deleted thread on rename or archive", async () => {
    const thread = await makeThread("gone");
    await deleteChatThread({ userId, threadId: thread.id });
    await expect(
      updateChatThread({ userId, threadId: thread.id, archived: true }),
    ).rejects.toBeInstanceOf(ThreadNotFoundError);
    expect(await getSyraaMemory().getThreadById({ threadId: thread.id })).toBeNull();
  });

  it("rejects chat turns for thread ids the server never issued", async () => {
    await expect(
      ensureChatThread({ userId, threadId: `made-up-${randomUUID()}` }),
    ).rejects.toBeInstanceOf(ThreadNotFoundError);
  });

  it("keeps updatedAt on archive", async () => {
    const thread = await makeThread("order");
    const archived = await updateChatThread({ userId, threadId: thread.id, archived: true });
    expect(archived.updatedAt).toBe(new Date(thread.updatedAt).toISOString());
  });

  it("refuses another user's thread", async () => {
    const theirs = await makeThread("not yours", otherUserId);
    await expect(
      updateChatThread({ userId, threadId: theirs.id, title: "mine now" }),
    ).rejects.toBeInstanceOf(ThreadNotFoundError);
    await expect(deleteChatThread({ userId, threadId: theirs.id })).rejects.toBeInstanceOf(
      ThreadNotFoundError,
    );
    expect((await getSyraaMemory().getThreadById({ threadId: theirs.id }))?.title).toBe(
      "not yours",
    );
  });

  it("404s a missing thread", async () => {
    await expect(deleteChatThread({ userId, threadId: randomUUID() })).rejects.toBeInstanceOf(
      ThreadNotFoundError,
    );
  });
});
