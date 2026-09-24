import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, ilike, inArray, or, type SQL, sql } from "drizzle-orm";
import type { ContextDb } from "./db/client.js";
import {
  type ContextResourceRow,
  contextCards,
  contextChunks,
  contextResources,
  contextTopics,
} from "./db/schema.js";
import { type ResourceStatus, utcNow } from "./models.js";
import { createQueryEmbedder, type QueryEmbedder } from "./retrieve/embed.js";
import {
  cosineSimilarity,
  makeSnippet,
  queryTerms,
  type RetrieveMode,
  reciprocalRankFusion,
  toLikePatterns,
  toOrTsQuery,
} from "./retrieve/search.js";

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

export type MaterialsLayer1Outline = {
  resourceId: string;
  name: string;
  status: ResourceStatus;
  /** Top-level section titles under the document root (depth === 1). */
  sectionTitles: string[];
};

export type SearchMaterialsInput = {
  query: string;
  /** Default 8, clamped to 1..20. */
  limit?: number;
  resourceIds?: string[];
  /** Default "hybrid". */
  mode?: RetrieveMode;
};

export type RetrieveHit = {
  chunkId: string;
  resourceId: string;
  documentName: string;
  /** Parent topic title (bridge chunk → the child topic it summarizes). */
  sectionTitle: string;
  sectionPath: string;
  role: string;
  snippet: string;
  score: number;
  matchedBy: ("lexical" | "semantic")[];
  anchor: Record<string, unknown>;
};

export type SemanticSkippedReason = "no_embedder" | "embed_failed" | "no_matching_vectors";

export type SearchMaterialsResult = {
  hits: RetrieveHit[];
  /** Effective mode — hybrid/semantic fall back to lexical when semantic is unavailable. */
  modeUsed: RetrieveMode;
  semanticSkippedReason?: SemanticSkippedReason;
};

export type ContextStoreOptions = {
  /** Query embedder for semantic search. Default: `createQueryEmbedder()` from env. */
  embedQuery?: QueryEmbedder | null;
};

export type ContextStore = {
  createResource(input: CreateResourceInput): Promise<ContextResourceRow>;
  getResource(userId: string, resourceId: string): Promise<ContextResourceRow | null>;
  listResources(userId: string, limit?: number): Promise<ContextResourceRow[]>;
  /** Ready materials + first topic layer (depth 1) for chat injection. */
  listMaterialsLayer1(userId: string, limit?: number): Promise<MaterialsLayer1Outline[]>;
  getResourceTopicTree(userId: string, resourceId: string): Promise<ResourceTopicTree | null>;
  /** Lexical + semantic (RRF) passage search across the user's ready materials. */
  searchMaterials(userId: string, input: SearchMaterialsInput): Promise<SearchMaterialsResult>;
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

/** Common English filler — dropped so "what do you know about X" searches for X. */
const STOPWORDS = new Set(
  (
    "a an and are as at be but by can could did do does for from had has have how i if in is it its " +
    "me my of on or our please should so tell than that the their them then there these they this " +
    "to was we were what when where which who why will with would you your about any anything " +
    "know find show give mention mentions mentioned say says said"
  ).split(" "),
);

const MIN_LIKE_TERM = 4;

function readyChunkScope(userId: string, resourceIds?: string[]): SQL {
  const conditions: SQL[] = [
    eq(contextChunks.userId, userId),
    eq(contextResources.status, "ready"),
  ];
  if (resourceIds) conditions.push(inArray(contextChunks.resourceId, resourceIds));
  return and(...conditions) as SQL;
}

export function createContextStore(db: ContextDb, opts: ContextStoreOptions = {}): ContextStore {
  const embedQuery = opts.embedQuery === undefined ? createQueryEmbedder() : opts.embedQuery;

  async function lexicalCandidates(
    userId: string,
    terms: string[],
    resourceIds: string[] | undefined,
    limit: number,
  ): Promise<Array<{ id: string; score: number }>> {
    const tsQuery = toOrTsQuery(terms);
    if (!tsQuery) return [];
    const tsv = sql`to_tsvector('english', ${contextChunks.text})`;
    const tsq = sql`to_tsquery('english', ${tsQuery})`;
    const rank = sql<number>`ts_rank(${tsv}, ${tsq})`;
    const rows = await db
      .select({ id: contextChunks.id, rank })
      .from(contextChunks)
      .innerJoin(contextResources, eq(contextResources.id, contextChunks.resourceId))
      .where(
        and(
          readyChunkScope(userId, resourceIds),
          or(
            sql`${tsv} @@ ${tsq}`,
            // Substring match catches tokens FTS splits oddly (e.g. "madverse.com"); short
            // terms are FTS-only so "db" doesn't match "sandbox".
            ...toLikePatterns(terms.filter((term) => term.length >= MIN_LIKE_TERM)).map((pattern) =>
              ilike(contextChunks.text, pattern),
            ),
          ),
        ),
      )
      .orderBy(desc(rank), asc(contextChunks.ordinal))
      .limit(limit);
    return rows.map((row) => ({ id: row.id, score: Number(row.rank) }));
  }

  async function semanticCandidates(
    userId: string,
    vector: number[],
    resourceIds: string[] | undefined,
    limit: number,
  ): Promise<Array<{ id: string; score: number }>> {
    // Only compare vectors from the same model (dimension); skips hash-fallback stubs.
    const dims = sql`CASE WHEN jsonb_typeof(${contextChunks.embedding}) = 'array' THEN jsonb_array_length(${contextChunks.embedding}) END`;
    const rows = await db
      .select({ id: contextChunks.id, embedding: contextChunks.embedding })
      .from(contextChunks)
      .innerJoin(contextResources, eq(contextResources.id, contextChunks.resourceId))
      .where(and(readyChunkScope(userId, resourceIds), sql`${dims} = ${vector.length}`));
    return rows
      .map((row) => ({ id: row.id, score: cosineSimilarity(vector, row.embedding ?? []) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

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

    async listMaterialsLayer1(userId, limit = 50) {
      const resources = await db
        .select()
        .from(contextResources)
        .where(and(eq(contextResources.userId, userId), eq(contextResources.status, "ready")))
        .orderBy(desc(contextResources.createdAt))
        .limit(limit);

      if (resources.length === 0) return [];

      const resourceIds = resources.map((r) => r.id);
      const topics = await db
        .select({
          resourceId: contextTopics.resourceId,
          title: contextTopics.title,
          ordinal: contextTopics.ordinal,
        })
        .from(contextTopics)
        .where(
          and(
            eq(contextTopics.userId, userId),
            eq(contextTopics.depth, 1),
            inArray(contextTopics.resourceId, resourceIds),
          ),
        )
        .orderBy(asc(contextTopics.ordinal));

      const byResource = new Map<string, string[]>();
      for (const topic of topics) {
        if (!topic.resourceId) continue;
        const list = byResource.get(topic.resourceId) ?? [];
        list.push(topic.title);
        byResource.set(topic.resourceId, list);
      }

      return resources.map((resource) => ({
        resourceId: resource.id,
        name: resource.name,
        status: resource.status,
        sectionTitles: byResource.get(resource.id) ?? [],
      }));
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

    async searchMaterials(userId, input) {
      const mode = input.mode ?? "hybrid";
      const limit = Math.min(20, Math.max(1, Math.floor(input.limit ?? 8)));
      const candidateLimit = limit * 4;
      const resourceIds = input.resourceIds;
      const terms = queryTerms(input.query, STOPWORDS);

      if (resourceIds && resourceIds.length === 0) {
        return { hits: [], modeUsed: mode };
      }

      const lexical =
        mode === "semantic"
          ? []
          : await lexicalCandidates(userId, terms, resourceIds, candidateLimit);

      let semantic: Array<{ id: string; score: number }> = [];
      let semanticSkippedReason: SemanticSkippedReason | undefined;
      if (mode !== "lexical") {
        if (!embedQuery) {
          semanticSkippedReason = "no_embedder";
        } else {
          try {
            const vector = await embedQuery(input.query);
            semantic = vector
              ? await semanticCandidates(userId, vector, resourceIds, candidateLimit)
              : [];
            if (semantic.length === 0) semanticSkippedReason = "no_matching_vectors";
          } catch (err) {
            semanticSkippedReason = "embed_failed";
            console.warn(
              `[context.search] query embedding failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      }

      const lexicalIds = new Set(lexical.map((row) => row.id));
      const semanticIds = new Set(semantic.map((row) => row.id));
      let modeUsed: RetrieveMode = mode;
      let ranked: Array<{ id: string; score: number }>;
      if (mode !== "lexical" && semantic.length > 0) {
        ranked =
          mode === "hybrid"
            ? reciprocalRankFusion([lexical.map((row) => row.id), semantic.map((row) => row.id)])
            : semantic;
      } else {
        // Lexical requested, or semantic unavailable → lexical ranking.
        modeUsed = "lexical";
        ranked =
          mode === "semantic"
            ? await lexicalCandidates(userId, terms, resourceIds, candidateLimit)
            : lexical;
        for (const row of ranked) lexicalIds.add(row.id);
      }
      ranked = ranked.slice(0, limit);

      let hits: RetrieveHit[] = [];
      if (ranked.length > 0) {
        const sectionTopicId = sql`CASE WHEN ${contextChunks.role} = 'bridge' AND ${contextChunks.childTopicId} IS NOT NULL THEN ${contextChunks.childTopicId} ELSE ${contextChunks.parentTopicId} END`;
        const rows = await db
          .select({
            id: contextChunks.id,
            resourceId: contextChunks.resourceId,
            role: contextChunks.role,
            text: contextChunks.text,
            anchor: contextChunks.anchor,
            documentName: contextResources.name,
            sectionTitle: contextTopics.title,
            sectionPath: contextTopics.path,
          })
          .from(contextChunks)
          .innerJoin(contextResources, eq(contextResources.id, contextChunks.resourceId))
          .leftJoin(contextTopics, sql`${contextTopics.id} = ${sectionTopicId}`)
          .where(
            and(
              eq(contextChunks.userId, userId),
              inArray(
                contextChunks.id,
                ranked.map((row) => row.id),
              ),
            ),
          );
        const byId = new Map(rows.map((row) => [row.id, row]));
        hits = ranked.flatMap(({ id, score }) => {
          const row = byId.get(id);
          if (!row) return [];
          const matchedBy: RetrieveHit["matchedBy"] = [];
          if (lexicalIds.has(id)) matchedBy.push("lexical");
          if (semanticIds.has(id)) matchedBy.push("semantic");
          return [
            {
              chunkId: id,
              resourceId: row.resourceId,
              documentName: row.documentName,
              sectionTitle: row.sectionTitle ?? "",
              sectionPath: row.sectionPath ?? "",
              role: row.role,
              snippet: makeSnippet(row.text, terms),
              score,
              matchedBy,
              anchor: row.anchor,
            },
          ];
        });
      }

      const topResources = [...new Set(hits.map((hit) => hit.resourceId))].slice(0, 3);
      console.info(
        `[context.search] mode=${mode} used=${modeUsed} terms=${terms.length} lexical=${lexical.length} semantic=${semantic.length} hits=${hits.length}` +
          (semanticSkippedReason ? ` semanticSkipped=${semanticSkippedReason}` : "") +
          ` top=${topResources.join(",") || "-"} q="${input.query.slice(0, 80)}"`,
      );

      return { hits, modeUsed, semanticSkippedReason };
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
