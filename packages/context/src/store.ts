import { randomUUID } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import type { ContextDb } from "./db/client.js";
import {
  type ContextResourceRow,
  contextCards,
  contextChunks,
  contextResources,
  contextTopics,
} from "./db/schema.js";
import { type ResourceStatus, utcNow } from "./models.js";

export type CreateResourceInput = {
  userId: string;
  driveKey: string;
  path: string;
  name: string;
  ext?: string | null;
  mime?: string | null;
  sizeBytes?: number | null;
  contentHash?: string | null;
  kindId?: string | null;
  subprojectId?: string | null;
  tags?: string[];
  id?: string;
};

/** Folder-style topic node; chunks appear as leaf "files" with text. */
export type TopicTreeNode = {
  id: string;
  kind: "topic" | "chunk";
  title: string;
  depth: number;
  ordinal: number;
  role?: string;
  text?: string;
  children: TopicTreeNode[];
};

export type ResourceTopicTree = {
  resource: ContextResourceRow;
  tree: TopicTreeNode[];
  topicCount: number;
  chunkCount: number;
};

export type ContextStore = {
  createResource(input: CreateResourceInput): Promise<ContextResourceRow>;
  getResource(userId: string, resourceId: string): Promise<ContextResourceRow | null>;
  listResources(userId: string, limit?: number): Promise<ContextResourceRow[]>;
  getResourceTopicTree(userId: string, resourceId: string): Promise<ResourceTopicTree | null>;
  setResourceStatus(
    userId: string,
    resourceId: string,
    status: ResourceStatus,
    opts?: { ingestError?: string | null; contentHash?: string | null },
  ): Promise<ContextResourceRow | null>;
};

function mapResource(row: ContextResourceRow): ContextResourceRow {
  return row;
}

function buildTopicTree(
  topics: Array<{
    id: string;
    parentId: string | null;
    title: string;
    depth: number;
    ordinal: number;
  }>,
  chunks: Array<{
    id: string;
    parentTopicId: string;
    childTopicId: string | null;
    role: string;
    ordinal: number;
    text: string;
  }>,
): TopicTreeNode[] {
  const byParent = new Map<string | null, typeof topics>();
  for (const topic of topics) {
    const key = topic.parentId;
    const list = byParent.get(key) ?? [];
    list.push(topic);
    byParent.set(key, list);
  }

  /** Leaf chunks live under parent topic; bridge chunks under the child they summarize. */
  const leafChunksByTopic = new Map<string, typeof chunks>();
  const bridgeChunksByChild = new Map<string, typeof chunks>();
  for (const chunk of chunks) {
    if (chunk.role === "bridge" && chunk.childTopicId) {
      const list = bridgeChunksByChild.get(chunk.childTopicId) ?? [];
      list.push(chunk);
      bridgeChunksByChild.set(chunk.childTopicId, list);
      continue;
    }
    const list = leafChunksByTopic.get(chunk.parentTopicId) ?? [];
    list.push(chunk);
    leafChunksByTopic.set(chunk.parentTopicId, list);
  }

  for (const list of byParent.values()) {
    list.sort((a, b) => a.ordinal - b.ordinal || a.title.localeCompare(b.title));
  }
  for (const list of leafChunksByTopic.values()) {
    list.sort((a, b) => a.ordinal - b.ordinal);
  }
  for (const list of bridgeChunksByChild.values()) {
    list.sort((a, b) => a.ordinal - b.ordinal);
  }

  function chunkNode(chunk: (typeof chunks)[number], depth: number): TopicTreeNode {
    const label =
      chunk.role === "bridge"
        ? `overview-${String(chunk.ordinal).padStart(3, "0")}.txt`
        : `${chunk.role}-${String(chunk.ordinal).padStart(3, "0")}.txt`;
    return {
      id: chunk.id,
      kind: "chunk",
      title: label,
      depth,
      ordinal: chunk.ordinal,
      role: chunk.role,
      text: chunk.text,
      children: [],
    };
  }

  function walk(parentId: string | null): TopicTreeNode[] {
    const topicChildren = byParent.get(parentId) ?? [];
    return topicChildren.map((topic) => {
      const bridges = (bridgeChunksByChild.get(topic.id) ?? []).map((chunk) =>
        chunkNode(chunk, topic.depth + 1),
      );
      const nestedTopics = walk(topic.id);
      const leaves = (leafChunksByTopic.get(topic.id) ?? []).map((chunk) =>
        chunkNode(chunk, topic.depth + 1),
      );
      return {
        id: topic.id,
        kind: "topic" as const,
        title: topic.title,
        depth: topic.depth,
        ordinal: topic.ordinal,
        // overview (bridge) first, then subfolders, then leaf body files
        children: [...bridges, ...nestedTopics, ...leaves],
      };
    });
  }

  return walk(null);
}

export function createContextStore(db: ContextDb): ContextStore {
  return {
    async createResource(input) {
      const now = utcNow();
      const id = input.id ?? randomUUID();
      const [row] = await db
        .insert(contextResources)
        .values({
          id,
          userId: input.userId,
          driveKey: input.driveKey,
          path: input.path,
          name: input.name,
          ext: input.ext ?? null,
          mime: input.mime ?? null,
          sizeBytes: input.sizeBytes ?? null,
          contentHash: input.contentHash ?? null,
          kindId: input.kindId ?? null,
          subprojectId: input.subprojectId ?? null,
          tags: input.tags ?? [],
          status: "pending_ingest",
          ingestError: null,
          createdAt: now,
          updatedAt: now,
          ingestedAt: null,
        })
        .returning();
      return mapResource(row);
    },

    async getResource(userId, resourceId) {
      const [row] = await db
        .select()
        .from(contextResources)
        .where(and(eq(contextResources.userId, userId), eq(contextResources.id, resourceId)))
        .limit(1);
      return row ? mapResource(row) : null;
    },

    async listResources(userId, limit = 50) {
      const rows = await db
        .select()
        .from(contextResources)
        .where(eq(contextResources.userId, userId))
        .orderBy(desc(contextResources.createdAt))
        .limit(limit);
      return rows.map(mapResource);
    },

    async getResourceTopicTree(userId, resourceId) {
      const resource = await this.getResource(userId, resourceId);
      if (!resource) return null;

      const topics = await db
        .select({
          id: contextTopics.id,
          parentId: contextTopics.parentId,
          title: contextTopics.title,
          depth: contextTopics.depth,
          ordinal: contextTopics.ordinal,
        })
        .from(contextTopics)
        .where(and(eq(contextTopics.userId, userId), eq(contextTopics.resourceId, resourceId)))
        .orderBy(asc(contextTopics.ordinal));

      const chunks = await db
        .select({
          id: contextChunks.id,
          parentTopicId: contextChunks.parentTopicId,
          childTopicId: contextChunks.childTopicId,
          role: contextChunks.role,
          ordinal: contextChunks.ordinal,
          text: contextChunks.text,
        })
        .from(contextChunks)
        .where(and(eq(contextChunks.userId, userId), eq(contextChunks.resourceId, resourceId)))
        .orderBy(asc(contextChunks.ordinal));

      return {
        resource,
        tree: buildTopicTree(topics, chunks),
        topicCount: topics.length,
        chunkCount: chunks.length,
      };
    },

    async setResourceStatus(userId, resourceId, status, opts = {}) {
      const now = utcNow();
      const [row] = await db
        .update(contextResources)
        .set({
          status,
          ingestError: opts.ingestError === undefined ? undefined : opts.ingestError,
          contentHash: opts.contentHash === undefined ? undefined : opts.contentHash,
          updatedAt: now,
          ingestedAt: status === "ready" ? now : undefined,
        })
        .where(and(eq(contextResources.userId, userId), eq(contextResources.id, resourceId)))
        .returning();
      return row ? mapResource(row) : null;
    },
  };
}

/** Re-export tables for advanced callers / tests. */
export { contextCards, contextChunks, contextResources, contextTopics };
