export {
  createContextDb,
  createContextDbFromUrl,
  createPgPool,
  migrateContextSchema,
  resolveDatabaseUrl,
} from "./db/client.js";
export {
  contextCards,
  contextChunks,
  contextResources,
  contextTopics,
} from "./db/schema.js";
export type {
  ChunkRole,
  ContextCard,
  ContextChunk,
  ContextResource,
  ContextTopic,
  ResourceStatus,
  TopicSource,
  TopicStatus,
} from "./models.js";
export { isResourceStatus, RESOURCE_STATUSES, utcNow } from "./models.js";
export type { EmbeddingConfig, QueryEmbedder, RemoteEmbeddingConfig } from "./retrieve/embed.js";
export { createQueryEmbedder, resolveEmbeddingConfig } from "./retrieve/embed.js";
export type { RetrieveMode } from "./retrieve/search.js";
export {
  cosineSimilarity,
  makeSnippet,
  queryTerms,
  reciprocalRankFusion,
  toLikePatterns,
  toOrTsQuery,
} from "./retrieve/search.js";
export type {
  ContextStore,
  ContextStoreOptions,
  CreateResourceInput,
  MaterialsLayer1Outline,
  ResourceTopicTree,
  RetrieveHit,
  SearchMaterialsInput,
  SearchMaterialsResult,
  SemanticSkippedReason,
  TopicTreeNode,
} from "./store.js";
export { createContextStore } from "./store.js";
