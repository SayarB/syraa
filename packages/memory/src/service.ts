import { randomUUID } from "node:crypto";
import {
  type Confidence,
  type CreatedBy,
  type ItemSource,
  type ItemStatus,
  type ItemType,
  isItemStatus,
  isItemType,
  type Memory,
  type MemoryItem,
  type MemoryScope,
  utcNow,
  validateScopeIds,
} from "./models.js";
import type { ListItemsQuery, MemoryRepository } from "./repository.js";

export class MemoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemoryError";
  }
}

function asMemoryError(e: unknown): MemoryError {
  return new MemoryError(e instanceof Error ? e.message : String(e));
}

export function createMemoryService(repo: MemoryRepository) {
  async function resolveMemory(opts: {
    userId: string;
    memoryId?: string;
    scope?: MemoryScope;
    kindId?: string | null;
    subprojectId?: string | null;
    ensure: boolean;
  }): Promise<Memory> {
    if (opts.memoryId) {
      const memory = await repo.getMemoryById(opts.memoryId);
      if (!memory || memory.userId !== opts.userId) {
        throw new MemoryError("memory not found for user");
      }
      return memory;
    }
    if (!opts.scope) throw new MemoryError("memoryId or scope is required");
    try {
      validateScopeIds(opts.scope, opts.kindId, opts.subprojectId);
    } catch (e) {
      throw asMemoryError(e);
    }
    if (opts.ensure) {
      return repo.ensureMemory(opts.userId, opts.scope, opts.kindId, opts.subprojectId);
    }
    const memory = await repo.getMemoryByScope(
      opts.userId,
      opts.scope,
      opts.kindId,
      opts.subprojectId,
    );
    if (!memory) throw new MemoryError("memory not found for user");
    return memory;
  }

  return {
    async ensureMemory(
      userId: string,
      scope: MemoryScope,
      kindId?: string | null,
      subprojectId?: string | null,
    ): Promise<Memory> {
      try {
        return await repo.ensureMemory(userId, scope, kindId, subprojectId);
      } catch (e) {
        throw asMemoryError(e);
      }
    },

    async getMemory(opts: {
      memoryId?: string;
      userId?: string;
      scope?: MemoryScope;
      kindId?: string | null;
      subprojectId?: string | null;
    }): Promise<Memory | null> {
      if (opts.memoryId) {
        const memory = await repo.getMemoryById(opts.memoryId);
        if (!memory) return null;
        if (opts.userId != null && memory.userId !== opts.userId) return null;
        return memory;
      }
      if (!opts.userId || !opts.scope) {
        throw new MemoryError("getMemory requires memoryId or userId+scope");
      }
      try {
        return await repo.getMemoryByScope(opts.userId, opts.scope, opts.kindId, opts.subprojectId);
      } catch (e) {
        throw asMemoryError(e);
      }
    },

    async listItems(userId: string, query: ListItemsQuery = {}): Promise<MemoryItem[]> {
      try {
        return await repo.listItems(userId, query);
      } catch (e) {
        throw asMemoryError(e);
      }
    },

    async createItem(input: {
      userId: string;
      text: string;
      type: ItemType | string;
      memoryId?: string;
      scope?: MemoryScope;
      kindId?: string | null;
      subprojectId?: string | null;
      status?: ItemStatus;
      source?: ItemSource;
      confidence?: Confidence;
      needsConfirm?: boolean;
      priority?: number;
      tags?: string[];
      why?: string | null;
      evidenceSessionId?: string | null;
      evidenceMessageIds?: string[];
      evidenceArtifactKey?: string | null;
      factResourceId?: string | null;
      factPath?: string | null;
      supersedesId?: string | null;
      forkedFromId?: string | null;
      createdBy?: CreatedBy;
    }): Promise<MemoryItem> {
      if (!isItemType(String(input.type))) {
        throw new MemoryError(`invalid item type: ${input.type}`);
      }
      const memory = await resolveMemory({
        userId: input.userId,
        memoryId: input.memoryId,
        scope: input.scope,
        kindId: input.kindId,
        subprojectId: input.subprojectId,
        ensure: true,
      });
      const now = utcNow();
      const item: MemoryItem = {
        id: randomUUID(),
        memoryId: memory.id,
        type: input.type as ItemType,
        text: input.text,
        status: input.status ?? "active",
        source: input.source ?? "explicit",
        confidence: input.confidence ?? "medium",
        needsConfirm: input.needsConfirm ?? false,
        priority: input.priority ?? 0,
        tags: input.tags ?? [],
        why: input.why ?? null,
        evidenceSessionId: input.evidenceSessionId ?? null,
        evidenceMessageIds: input.evidenceMessageIds ?? [],
        evidenceArtifactKey: input.evidenceArtifactKey ?? null,
        factResourceId: input.factResourceId ?? null,
        factPath: input.factPath ?? null,
        supersedesId: input.supersedesId ?? null,
        forkedFromId: input.forkedFromId ?? null,
        createdBy: input.createdBy ?? "user",
        confirmedAt: null,
        confirmedBy: null,
        createdAt: now,
        updatedAt: now,
      };
      return repo.insertItem(item);
    },

    async updateItem(
      userId: string,
      itemId: string,
      patch: Record<string, unknown>,
    ): Promise<MemoryItem> {
      if ("type" in patch) throw new MemoryError("item type cannot be updated");
      if ("status" in patch && !isItemStatus(String(patch.status))) {
        throw new MemoryError(`invalid status: ${patch.status}`);
      }
      if ("tags" in patch && !Array.isArray(patch.tags)) {
        throw new MemoryError("tags must be an array");
      }
      if ("evidenceMessageIds" in patch && !Array.isArray(patch.evidenceMessageIds)) {
        throw new MemoryError("evidenceMessageIds must be an array");
      }
      try {
        const updated = await repo.updateItemFields(userId, itemId, patch);
        if (!updated) throw new MemoryError("item not found for user");
        return updated;
      } catch (e) {
        if (e instanceof MemoryError) throw e;
        throw asMemoryError(e);
      }
    },

    async setItemStatus(
      userId: string,
      itemId: string,
      status: ItemStatus | string,
    ): Promise<MemoryItem> {
      if (!isItemStatus(String(status))) {
        throw new MemoryError(`invalid status: ${status}`);
      }
      const updated = await repo.updateItemFields(userId, itemId, { status });
      if (!updated) throw new MemoryError("item not found for user");
      return updated;
    },

    async updateBrief(
      userId: string,
      brief: string | null,
      opts: {
        memoryId?: string;
        scope?: MemoryScope;
        kindId?: string | null;
        subprojectId?: string | null;
      } = {},
    ): Promise<Memory> {
      const memory = await resolveMemory({ userId, ...opts, ensure: false });
      return repo.updateBrief(memory.id, brief);
    },

    async updateOpenLoops(
      userId: string,
      openLoops: string[],
      opts: {
        memoryId?: string;
        scope?: MemoryScope;
        kindId?: string | null;
        subprojectId?: string | null;
      } = {},
    ): Promise<Memory> {
      const memory = await resolveMemory({ userId, ...opts, ensure: false });
      return repo.updateOpenLoops(memory.id, openLoops);
    },
  };
}

export type MemoryService = ReturnType<typeof createMemoryService>;
