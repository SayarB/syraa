import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type ContextDb,
  contextChunks,
  contextResources,
  contextTopics,
  createContextDbFromUrl,
  createContextStore,
  migrateContextSchema,
  type QueryEmbedder,
} from "../src/index.js";

const hasDb = Boolean(process.env.DATABASE_URL);

const USER = `search-test-${randomUUID()}`;
const OTHER_USER = `search-test-other-${randomUUID()}`;

/** Fake semantic space: axis 0 = vector databases, axis 1 = cooking. */
const VECTORS: Record<string, number[]> = {
  chroma: [1, 0, 0, 0],
  bridge: [0, 1, 0, 0],
};

describe.skipIf(!hasDb)("searchMaterials (db)", () => {
  let pool: Pool;
  let db: ContextDb;
  const ids: Record<string, string> = {};

  async function seedResource(opts: {
    userId: string;
    name: string;
    status: "ready" | "pending_ingest";
    chunks: Array<{ key: string; text: string; role?: string; embedding?: number[] | null }>;
  }): Promise<void> {
    const now = new Date().toISOString();
    const resourceId = randomUUID();
    const rootId = randomUUID();
    const sectionId = randomUUID();
    await db.insert(contextResources).values({
      id: resourceId,
      userId: opts.userId,
      driveKey: `${opts.userId}/${opts.name}`,
      path: `/${opts.name}`,
      name: opts.name,
      status: opts.status,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(contextTopics).values([
      {
        id: rootId,
        userId: opts.userId,
        resourceId,
        path: "/doc",
        title: opts.name,
        depth: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: sectionId,
        userId: opts.userId,
        resourceId,
        parentId: rootId,
        path: "/doc/tools",
        title: "Tools we use",
        depth: 1,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    for (const [ordinal, chunk] of opts.chunks.entries()) {
      const id = randomUUID();
      ids[chunk.key] = id;
      const isBridge = chunk.role === "bridge";
      await db.insert(contextChunks).values({
        id,
        userId: opts.userId,
        resourceId,
        parentTopicId: isBridge ? rootId : sectionId,
        childTopicId: isBridge ? sectionId : null,
        role: (chunk.role ?? "leaf") as never,
        ordinal,
        text: chunk.text,
        embedding: chunk.embedding ?? null,
        contentHash: id,
        createdAt: now,
      });
    }
    ids[`resource:${opts.name}`] = resourceId;
  }

  beforeAll(async () => {
    await migrateContextSchema(process.env.DATABASE_URL as string);
    ({ pool, db } = await createContextDbFromUrl());

    await seedResource({
      userId: USER,
      name: "Principles.pdf",
      status: "ready",
      chunks: [
        {
          key: "bridge",
          role: "bridge",
          text: "Overview of the recipes and kitchen habits section.",
          embedding: VECTORS.bridge,
        },
        {
          key: "chroma",
          text: "We store embeddings in Chroma, an open-source vector database.",
          embedding: VECTORS.chroma,
        },
        {
          key: "hashStub",
          text: "Unrelated note about gardening.",
          embedding: Array(64).fill(0.1),
        },
        { key: "sandbox", text: "We run experiments in a sandbox environment." },
        { key: "domain", text: "Releases go out via distrokid.com for now." },
      ],
    });
    await seedResource({
      userId: USER,
      name: "Draft.pdf",
      status: "pending_ingest",
      chunks: [{ key: "pending", text: "Chroma draft notes not ready yet." }],
    });
    await seedResource({
      userId: OTHER_USER,
      name: "Secret.pdf",
      status: "ready",
      chunks: [
        {
          key: "other",
          text: "Another user's Chroma and Madverse notes.",
          embedding: VECTORS.chroma,
        },
      ],
    });
  });

  afterAll(async () => {
    if (!db) return;
    for (const userId of [USER, OTHER_USER]) {
      await db.delete(contextResources).where(eq(contextResources.userId, userId));
      await db.delete(contextTopics).where(eq(contextTopics.userId, userId));
    }
    await pool.end();
  });

  it("finds a proper noun lexically, scoped to the user and ready resources", async () => {
    const store = createContextStore(db, { embedQuery: null });
    const result = await store.searchMaterials(USER, { query: "What do you know about Chroma?" });
    expect(result.modeUsed).toBe("lexical");
    expect(result.semanticSkippedReason).toBe("no_embedder");
    expect(result.hits.map((hit) => hit.chunkId)).toEqual([ids.chroma]);
    const [hit] = result.hits;
    expect(hit).toMatchObject({
      documentName: "Principles.pdf",
      sectionTitle: "Tools we use",
      sectionPath: "/doc/tools",
      matchedBy: ["lexical"],
    });
    expect(hit.snippet).toContain("Chroma");
  });

  it("returns an honest empty result for an unmentioned name", async () => {
    const store = createContextStore(db, { embedQuery: null });
    const result = await store.searchMaterials(USER, { query: "madverse" });
    expect(result.hits).toEqual([]);
  });

  it("keeps short terms FTS-only and substring-matches long ones", async () => {
    const store = createContextStore(db, { embedQuery: null });
    const chromaDb = await store.searchMaterials(USER, { query: "chroma db" });
    expect(chromaDb.hits.map((hit) => hit.chunkId)).toEqual([ids.chroma]);
    // FTS indexes "distrokid.com" as one host token; ILIKE still finds the bare name.
    const domain = await store.searchMaterials(USER, { query: "distrokid" });
    expect(domain.hits.map((hit) => hit.chunkId)).toEqual([ids.domain]);
  });

  it("uses OR semantics across terms", async () => {
    const store = createContextStore(db, { embedQuery: null });
    const result = await store.searchMaterials(USER, { query: "chroma zebra" });
    expect(result.hits.map((hit) => hit.chunkId)).toContain(ids.chroma);
  });

  it("hybrid ranks the exact-token chunk above an unrelated bridge and skips mismatched dims", async () => {
    const embedQuery: QueryEmbedder = async () => [0.9, 0.3, 0, 0];
    const store = createContextStore(db, { embedQuery });
    const result = await store.searchMaterials(USER, { query: "chroma" });
    expect(result.modeUsed).toBe("hybrid");
    const order = result.hits.map((hit) => hit.chunkId);
    expect(order[0]).toBe(ids.chroma);
    expect(order).toContain(ids.bridge);
    expect(order).not.toContain(ids.hashStub);
    expect(order).not.toContain(ids.other);
    expect(result.hits[0].matchedBy).toEqual(["lexical", "semantic"]);
    // bridge chunk reports the child topic it summarizes
    expect(result.hits.find((hit) => hit.chunkId === ids.bridge)?.sectionTitle).toBe(
      "Tools we use",
    );
  });

  it("falls back to lexical when the embedder throws", async () => {
    const store = createContextStore(db, {
      embedQuery: async () => {
        throw new Error("boom");
      },
    });
    const result = await store.searchMaterials(USER, { query: "chroma" });
    expect(result.modeUsed).toBe("lexical");
    expect(result.semanticSkippedReason).toBe("embed_failed");
    expect(result.hits.map((hit) => hit.chunkId)).toEqual([ids.chroma]);
  });

  it("narrows to resourceIds and handles hostile input", async () => {
    const store = createContextStore(db, { embedQuery: null });
    const scoped = await store.searchMaterials(USER, {
      query: "chroma",
      resourceIds: [ids["resource:Draft.pdf"]],
    });
    expect(scoped.hits).toEqual([]);
    const hostile = await store.searchMaterials(USER, { query: "'); DROP TABLE x; -- % _ & | !" });
    expect(Array.isArray(hostile.hits)).toBe(true);
  });
});
