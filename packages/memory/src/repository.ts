import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { createMemoryDbFromUrl } from "./db/client.js";
import { type MemoryItemRow, type MemoryRow, memories, memoryItems } from "./db/schema.js";
import {
  type ItemStatus,
  type ItemType,
  type Memory,
  type MemoryItem,
  type MemoryScope,
  makeScopeKey,
  utcNow,
  validateScopeIds,
} from "./models.js";

export interface ListItemsQuery {
  memoryId?: string;
  scope?: MemoryScope;
  kindId?: string | null;
  subprojectId?: string | null;
  types?: ItemType[];
  /** undefined = all except deleted; explicit list overrides */
  statuses?: ItemStatus[];
  limit?: number;
}

const UPDATABLE_ITEM_FIELDS = new Set([
  "text",
  "status",
  "source",
  "confidence",
  "needsConfirm",
  "priority",
  "tags",
  "why",
  "evidenceSessionId",
  "evidenceMessageIds",
  "evidenceArtifactKey",
  "factResourceId",
  "factPath",
  "supersedesId",
  "forkedFromId",
  "confirmedAt",
  "confirmedBy",
]);

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

export async function createPostgresMemoryRepository(connectionString?: string) {
  const { pool, db } = await createMemoryDbFromUrl(connectionString);

  async function getMemoryById(memoryId: string): Promise<Memory | null> {
    const row = await db.select().from(memories).where(eq(memories.id, memoryId)).limit(1);
    return row[0] ? rowToMemory(row[0]) : null;
  }

  async function getMemoryByScope(
    userId: string,
    scope: MemoryScope,
    kindId?: string | null,
    subprojectId?: string | null,
  ): Promise<Memory | null> {
    const ids = validateScopeIds(scope, kindId, subprojectId);
    const scopeKey = makeScopeKey(ids.scope, ids.kindId, ids.subprojectId);
    const row = await db
      .select()
      .from(memories)
      .where(and(eq(memories.userId, userId), eq(memories.scopeKey, scopeKey)))
      .limit(1);
    return row[0] ? rowToMemory(row[0]) : null;
  }

  async function getItemForUser(userId: string, itemId: string): Promise<MemoryItem | null> {
    const row = await db
      .select({ item: memoryItems })
      .from(memoryItems)
      .innerJoin(memories, eq(memoryItems.memoryId, memories.id))
      .where(and(eq(memoryItems.id, itemId), eq(memories.userId, userId)))
      .limit(1);
    return row[0] ? rowToItem(row[0].item) : null;
  }

  return {
    async ensureMemory(
      userId: string,
      scope: MemoryScope,
      kindId?: string | null,
      subprojectId?: string | null,
    ): Promise<Memory> {
      const ids = validateScopeIds(scope, kindId, subprojectId);
      const existing = await getMemoryByScope(userId, ids.scope, ids.kindId, ids.subprojectId);
      if (existing) return existing;

      const now = utcNow();
      const id = randomUUID();
      const scopeKey = makeScopeKey(ids.scope, ids.kindId, ids.subprojectId);
      try {
        await db.insert(memories).values({
          id,
          userId,
          scope: ids.scope,
          kindId: ids.kindId,
          subprojectId: ids.subprojectId,
          scopeKey,
          brief: null,
          openLoops: [],
          createdAt: now,
          updatedAt: now,
        });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        const raced = await getMemoryByScope(userId, ids.scope, ids.kindId, ids.subprojectId);
        if (!raced) throw err;
        return raced;
      }
      return (await getMemoryById(id))!;
    },

    getMemoryById,
    getMemoryByScope,

    async updateBrief(memoryId: string, brief: string | null): Promise<Memory> {
      await db
        .update(memories)
        .set({ brief, updatedAt: utcNow() })
        .where(eq(memories.id, memoryId));
      const mem = await getMemoryById(memoryId);
      if (!mem) throw new Error(`memory not found: ${memoryId}`);
      return mem;
    },

    async updateOpenLoops(memoryId: string, openLoops: string[]): Promise<Memory> {
      await db
        .update(memories)
        .set({ openLoops, updatedAt: utcNow() })
        .where(eq(memories.id, memoryId));
      const mem = await getMemoryById(memoryId);
      if (!mem) throw new Error(`memory not found: ${memoryId}`);
      return mem;
    },

    async insertItem(item: MemoryItem): Promise<MemoryItem> {
      await db.insert(memoryItems).values({
        id: item.id,
        memoryId: item.memoryId,
        type: item.type,
        text: item.text,
        status: item.status,
        source: item.source,
        confidence: item.confidence,
        needsConfirm: item.needsConfirm,
        priority: item.priority,
        tags: item.tags,
        why: item.why,
        evidenceSessionId: item.evidenceSessionId,
        evidenceMessageIds: item.evidenceMessageIds,
        evidenceArtifactKey: item.evidenceArtifactKey,
        factResourceId: item.factResourceId,
        factPath: item.factPath,
        supersedesId: item.supersedesId,
        forkedFromId: item.forkedFromId,
        createdBy: item.createdBy,
        confirmedAt: item.confirmedAt,
        confirmedBy: item.confirmedBy,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      });
      return item;
    },

    getItemForUser,

    async updateItemFields(
      userId: string,
      itemId: string,
      fields: Record<string, unknown>,
    ): Promise<MemoryItem | null> {
      const patch: Partial<typeof memoryItems.$inferInsert> = { updatedAt: utcNow() };
      for (const [key, raw] of Object.entries(fields)) {
        if (!UPDATABLE_ITEM_FIELDS.has(key)) throw new Error(`cannot update field: ${key}`);
        (patch as Record<string, unknown>)[key] = raw;
      }

      const ownedMemoryIds = db
        .select({ id: memories.id })
        .from(memories)
        .where(eq(memories.userId, userId));

      const updated = await db
        .update(memoryItems)
        .set(patch)
        .where(and(eq(memoryItems.id, itemId), inArray(memoryItems.memoryId, ownedMemoryIds)))
        .returning({ id: memoryItems.id });

      if (updated.length === 0) return null;
      return getItemForUser(userId, itemId);
    },

    async listItems(userId: string, query: ListItemsQuery = {}): Promise<MemoryItem[]> {
      if (query.types?.length === 0) return [];
      if (query.statuses?.length === 0) return [];

      const conditions = [eq(memories.userId, userId)];

      if (query.memoryId) {
        conditions.push(eq(memoryItems.memoryId, query.memoryId));
      }
      if (query.scope) {
        const ids = validateScopeIds(query.scope, query.kindId, query.subprojectId);
        const scopeKey = makeScopeKey(ids.scope, ids.kindId, ids.subprojectId);
        conditions.push(eq(memories.scopeKey, scopeKey));
      }
      if (query.types?.length) {
        conditions.push(inArray(memoryItems.type, query.types));
      }
      if (query.statuses === undefined) {
        conditions.push(ne(memoryItems.status, "deleted"));
      } else {
        conditions.push(inArray(memoryItems.status, query.statuses));
      }

      let q = db
        .select({ item: memoryItems })
        .from(memoryItems)
        .innerJoin(memories, eq(memoryItems.memoryId, memories.id))
        .where(and(...conditions))
        .orderBy(desc(memoryItems.priority), desc(memoryItems.createdAt));

      if (query.limit != null) {
        q = q.limit(query.limit) as typeof q;
      }

      const rows = await q;
      return rows.map((r) => rowToItem(r.item));
    },

    async itemTableColumns(): Promise<Set<string>> {
      const result = await db.execute<{ column_name: string }>(sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'memory_items'
      `);
      return new Set(result.rows.map((r) => r.column_name));
    },

    /** Test helper — truncate all memory tables. */
    async clearAll(): Promise<void> {
      await db.execute(sql`TRUNCATE TABLE memory_items, memories RESTART IDENTITY CASCADE`);
    },

    async close(): Promise<void> {
      await pool.end();
    },
  };
}

export type MemoryRepository = Awaited<ReturnType<typeof createPostgresMemoryRepository>>;

function rowToMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    userId: row.userId,
    scope: row.scope,
    kindId: row.kindId ?? null,
    subprojectId: row.subprojectId ?? null,
    brief: row.brief ?? null,
    openLoops: normalizeStringArray(row.openLoops),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToItem(row: MemoryItemRow): MemoryItem {
  return {
    id: row.id,
    memoryId: row.memoryId,
    type: row.type,
    text: row.text,
    status: row.status,
    source: row.source,
    confidence: row.confidence,
    needsConfirm: Boolean(row.needsConfirm),
    priority: row.priority,
    tags: normalizeStringArray(row.tags),
    why: row.why ?? null,
    evidenceSessionId: row.evidenceSessionId ?? null,
    evidenceMessageIds: normalizeStringArray(row.evidenceMessageIds),
    evidenceArtifactKey: row.evidenceArtifactKey ?? null,
    factResourceId: row.factResourceId ?? null,
    factPath: row.factPath ?? null,
    supersedesId: row.supersedesId ?? null,
    forkedFromId: row.forkedFromId ?? null,
    createdBy: row.createdBy,
    confirmedAt: row.confirmedAt ?? null,
    confirmedBy: row.confirmedBy ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}
