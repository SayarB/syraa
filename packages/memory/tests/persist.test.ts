import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createPostgresMemoryRepository, type MemoryRepository } from "../src/repository.js";
import { createMemoryService, MemoryError, type MemoryService } from "../src/service.js";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("phase 1 persist", () => {
  let repo: MemoryRepository;
  let s: MemoryService;

  beforeAll(async () => {
    repo = await createPostgresMemoryRepository();
    s = createMemoryService(repo);
  });

  afterEach(async () => {
    await repo.clearAll();
  });

  afterAll(async () => {
    await repo.close();
  });

  it("ensureMemory is idempotent", async () => {
    const a = await s.ensureMemory("u1", "user");
    const b = await s.ensureMemory("u1", "user");
    expect(a.id).toBe(b.id);
  });

  it("ensureMemory isolates users on same scope", async () => {
    const a = await s.ensureMemory("alice", "user");
    const b = await s.ensureMemory("bob", "user");
    expect(a.id).not.toBe(b.id);
  });

  it("enforces scope rules", async () => {
    await expect(s.ensureMemory("u1", "kind")).rejects.toThrow(MemoryError);
    await expect(s.ensureMemory("u1", "subproject", "study")).rejects.toThrow(MemoryError);
    await expect(s.ensureMemory("u1", "user", "x")).rejects.toThrow(MemoryError);
    const kind = await s.ensureMemory("u1", "kind", "study-plan");
    expect(kind.kindId).toBe("study-plan");
    const sp = await s.ensureMemory("u1", "subproject", "study-plan", "bio");
    expect(sp.subprojectId).toBe("bio");
  });

  it("memory_items has no user_id column", async () => {
    const cols = await repo.itemTableColumns();
    expect(cols.has("user_id")).toBe(false);
    expect(cols.has("memory_id")).toBe(true);
  });

  it("creates and lists preference", async () => {
    const mem = await s.ensureMemory("u1", "user");
    const item = await s.createItem({
      userId: "u1",
      memoryId: mem.id,
      type: "preference",
      text: "Keep answers short.",
    });
    expect(item.status).toBe("active");
    const listed = await s.listItems("u1", { statuses: ["active"] });
    expect(listed.some((i) => i.id === item.id)).toBe(true);
  });

  it("creates item by scope without memoryId", async () => {
    const item = await s.createItem({
      userId: "u1",
      scope: "kind",
      kindId: "quiz",
      type: "method",
      text: "Warm-up then drill",
    });
    const mem = await s.getMemory({ userId: "u1", scope: "kind", kindId: "quiz" });
    expect(mem?.id).toBe(item.memoryId);
  });

  it("enforces tenancy isolation", async () => {
    const mem = await s.ensureMemory("alice", "user");
    const item = await s.createItem({
      userId: "alice",
      memoryId: mem.id,
      type: "rule",
      text: "Always cite.",
    });
    expect(await s.listItems("bob", { memoryId: mem.id })).toEqual([]);
    await expect(s.updateItem("bob", item.id, { text: "hacked" })).rejects.toThrow(MemoryError);
    await expect(s.setItemStatus("bob", item.id, "deleted")).rejects.toThrow(MemoryError);
    await expect(
      s.createItem({
        userId: "bob",
        memoryId: mem.id,
        type: "rule",
        text: "nope",
      }),
    ).rejects.toThrow(MemoryError);
    expect(await s.getMemory({ memoryId: mem.id, userId: "bob" })).toBeNull();
    expect((await s.getMemory({ memoryId: mem.id, userId: "alice" }))?.id).toBe(mem.id);
  });

  it("soft-deletes items", async () => {
    const mem = await s.ensureMemory("u1", "user");
    const item = await s.createItem({
      userId: "u1",
      memoryId: mem.id,
      type: "method",
      text: "Exit ticket",
    });
    await s.setItemStatus("u1", item.id, "deleted");
    expect((await s.listItems("u1", { memoryId: mem.id })).every((i) => i.id !== item.id)).toBe(
      true,
    );
    expect(
      (await s.listItems("u1", { memoryId: mem.id, statuses: ["deleted"] })).some(
        (i) => i.id === item.id,
      ),
    ).toBe(true);
  });

  it("empty status/type filters return no rows", async () => {
    await s.ensureMemory("u1", "user");
    await s.createItem({ userId: "u1", scope: "user", type: "rule", text: "x" });
    expect(await s.listItems("u1", { statuses: [] })).toEqual([]);
    expect(await s.listItems("u1", { types: [] })).toEqual([]);
  });

  it("persists brief and open_loops", async () => {
    const mem = await s.ensureMemory("u1", "kind", "quiz");
    await s.updateBrief("u1", "Quiz playbook", { memoryId: mem.id });
    await s.updateOpenLoops("u1", ["Exam date?"], { memoryId: mem.id });
    const got = await s.getMemory({ memoryId: mem.id, userId: "u1" });
    expect(got?.brief).toBe("Quiz playbook");
    expect(got?.openLoops).toEqual(["Exam date?"]);
  });

  it("rejects invalid item types and status patches", async () => {
    const mem = await s.ensureMemory("u1", "user");
    await expect(
      s.createItem({ userId: "u1", memoryId: mem.id, type: "suggestion", text: "Nope" }),
    ).rejects.toThrow(MemoryError);
    await expect(
      s.createItem({
        userId: "u1",
        memoryId: mem.id,
        type: "open_question",
        text: "Nope",
      }),
    ).rejects.toThrow(MemoryError);

    const item = await s.createItem({
      userId: "u1",
      memoryId: mem.id,
      type: "rule",
      text: "ok",
    });
    await expect(s.updateItem("u1", item.id, { type: "method" })).rejects.toThrow(MemoryError);
    await expect(s.updateItem("u1", item.id, { status: "nope" })).rejects.toThrow(MemoryError);
    await expect(s.setItemStatus("u1", item.id, "archived")).rejects.toThrow(MemoryError);
    await expect(s.updateItem("u1", item.id, { tags: "x" as unknown as string[] })).rejects.toThrow(
      MemoryError,
    );
  });

  it("round-trips tags, needsConfirm, and priority ordering", async () => {
    const mem = await s.ensureMemory("u1", "user");
    const low = await s.createItem({
      userId: "u1",
      memoryId: mem.id,
      type: "fact_ref",
      text: "low",
      priority: 1,
      tags: ["a", "b"],
      needsConfirm: true,
    });
    const high = await s.createItem({
      userId: "u1",
      memoryId: mem.id,
      type: "decision",
      text: "high",
      priority: 10,
    });
    expect(low.tags).toEqual(["a", "b"]);
    expect(low.needsConfirm).toBe(true);

    const listed = await s.listItems("u1", { memoryId: mem.id });
    expect(listed.map((i) => i.id)).toEqual([high.id, low.id]);

    const updated = await s.updateItem("u1", low.id, {
      tags: ["c"],
      needsConfirm: false,
      text: "low2",
    });
    expect(updated.tags).toEqual(["c"]);
    expect(updated.needsConfirm).toBe(false);
    expect(updated.text).toBe("low2");
  });

  it("filters by type and respects limit", async () => {
    const mem = await s.ensureMemory("u1", "user");
    await s.createItem({ userId: "u1", memoryId: mem.id, type: "rule", text: "r1", priority: 2 });
    await s.createItem({
      userId: "u1",
      memoryId: mem.id,
      type: "preference",
      text: "p1",
      priority: 1,
    });
    await s.createItem({ userId: "u1", memoryId: mem.id, type: "rule", text: "r2", priority: 3 });

    const rules = await s.listItems("u1", { types: ["rule"] });
    expect(rules.every((i) => i.type === "rule")).toBe(true);
    expect(rules).toHaveLength(2);

    const limited = await s.listItems("u1", { limit: 1 });
    expect(limited).toHaveLength(1);
    expect(limited[0]?.text).toBe("r2");
  });

  it("persists across reconnect", async () => {
    const repo1 = await createPostgresMemoryRepository();
    const s1 = createMemoryService(repo1);
    const mem = await s1.ensureMemory("u1", "user");
    const item = await s1.createItem({
      userId: "u1",
      memoryId: mem.id,
      type: "rule",
      text: "Durable rule",
      tags: ["persist"],
    });
    await s1.updateBrief("u1", "Brief", { memoryId: mem.id });
    await repo1.close();

    const repo2 = await createPostgresMemoryRepository();
    const s2 = createMemoryService(repo2);
    const got = await s2.getMemory({ memoryId: mem.id, userId: "u1" });
    expect(got?.brief).toBe("Brief");
    const listed = await s2.listItems("u1", { memoryId: mem.id });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(item.id);
    expect(listed[0]?.tags).toEqual(["persist"]);
    await repo2.close();
  });

  it("updateBrief/openLoops require existing memory for user", async () => {
    await expect(s.updateBrief("u1", "x", { scope: "user" })).rejects.toThrow(MemoryError);
    await expect(s.updateOpenLoops("u1", [], { scope: "user" })).rejects.toThrow(MemoryError);
  });
});
