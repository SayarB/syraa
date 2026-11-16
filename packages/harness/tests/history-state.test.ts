import { randomUUID } from "node:crypto";
import { applyChunk, emptyCompactionState } from "@syraa/history";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createCompactionStateStore, ensureHistoryReady } from "../src/history-state.js";

function stateWithChunk() {
  return applyChunk(emptyCompactionState(new Date(0)), {
    index: 0,
    fromTurn: 0,
    toTurn: 3,
    fromPos: 1,
    toPos: 8,
    fromId: "a",
    toId: "b",
    detail: "detail",
    short: "short",
  });
}

describe("compaction state store (query shape)", () => {
  function storeWith(rows: unknown[], rowCount = rows.length) {
    const query = vi.fn(async () => ({ rows, rowCount }));
    return { query, store: createCompactionStateStore(() => ({ query }) as never) };
  }

  it("loads only the user's own row and ignores malformed state", async () => {
    const good = storeWith([{ state: JSON.parse(JSON.stringify(stateWithChunk())) }]);
    expect((await good.store.load("u1", "t1"))?.chunks).toHaveLength(1);
    expect(good.query).toHaveBeenCalledWith(expect.stringContaining("user_id = $2"), ["t1", "u1"]);

    expect(await storeWith([{ state: { version: 9 } }]).store.load("u1", "t1")).toBeNull();
    expect(await storeWith([]).store.load("u1", "t1")).toBeNull();
  });

  it("writes only while the stored revision matches and the thread exists", async () => {
    const ok = storeWith([{ thread_id: "t1" }]);
    const state = stateWithChunk();
    expect(await ok.store.save("u1", "t1", state, 0)).toBe(true);

    const [sql, params] = ok.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("FROM mastra_threads");
    expect(sql).toContain("(thread_history_summaries.state->>'rev')::int = $4::int");
    expect(params).toEqual(["t1", "u1", JSON.stringify(state), 0]);

    expect(await storeWith([], 0).store.save("u1", "t1", state, 7)).toBe(false);
  });

  it("deletes by thread", async () => {
    const { store, query } = storeWith([]);
    await store.remove("t1");
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM thread_history_summaries"),
      ["t1"],
    );
  });
});

// Runs where a database is available (CI); skipped locally without DATABASE_URL.
describe.skipIf(!process.env.DATABASE_URL)("compaction state store (Postgres)", () => {
  const userId = `history-${randomUUID()}`;
  const threadIds: string[] = [];
  let getSyraaMemory: typeof import("../src/mastra/memory.js").getSyraaMemory;
  let closeMastraStorage: typeof import("../src/mastra/storage.js").closeMastraStorage;
  let closeHarnessPool: typeof import("../src/db.js").closeHarnessPool;

  beforeAll(async () => {
    const storage = await import("../src/mastra/storage.js");
    ({ getSyraaMemory } = await import("../src/mastra/memory.js"));
    ({ closeHarnessPool } = await import("../src/db.js"));
    closeMastraStorage = storage.closeMastraStorage;
    await storage.ensureMastraStorageReady();
    await ensureHistoryReady();
  });

  afterAll(async () => {
    const store = createCompactionStateStore();
    for (const threadId of threadIds) {
      await store.remove(threadId);
      await getSyraaMemory()
        .deleteThread(threadId)
        .catch(() => undefined);
    }
    await closeHarnessPool();
    await closeMastraStorage();
  });

  async function makeThread(): Promise<string> {
    const thread = await getSyraaMemory().createThread({
      resourceId: userId,
      title: "t",
      metadata: {},
    });
    threadIds.push(thread.id);
    return thread.id;
  }

  it("saves, guards against a stale revision, and keeps users apart", async () => {
    const store = createCompactionStateStore();
    const threadId = await makeThread();
    const first = stateWithChunk();

    expect(await store.save(userId, threadId, first, 0)).toBe(true);
    expect((await store.load(userId, threadId))?.rev).toBe(1);
    expect(await store.load("someone-else", threadId)).toBeNull();

    // a writer that read rev 0 must not overwrite rev 1
    expect(await store.save(userId, threadId, { ...first, rev: 2 }, 0)).toBe(false);
    expect(await store.save(userId, threadId, { ...first, rev: 2 }, 1)).toBe(true);
    expect((await store.load(userId, threadId))?.rev).toBe(2);

    // another user can't take over the row
    expect(await store.save("someone-else", threadId, { ...first, rev: 3 }, 2)).toBe(false);
  });

  it("will not store summaries for a thread that does not exist", async () => {
    const store = createCompactionStateStore();
    expect(await store.save(userId, `missing-${randomUUID()}`, stateWithChunk(), 0)).toBe(false);
  });

  it("forgets a thread's summaries", async () => {
    const store = createCompactionStateStore();
    const threadId = await makeThread();
    await store.save(userId, threadId, stateWithChunk(), 0);
    await store.remove(threadId);
    expect(await store.load(userId, threadId)).toBeNull();
  });
});
