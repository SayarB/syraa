export type ResourceStatus = "pending_ingest" | "ready" | "failed" | "deleted";
export type TopicSource = "extracted" | "merged" | "user_edited";
export type TopicStatus = "active" | "superseded" | "deleted";
export type ChunkRole = "bridge" | "leaf";

export const RESOURCE_STATUSES: readonly ResourceStatus[] = [
  "pending_ingest",
  "ready",
  "failed",
  "deleted",
] as const;

export function utcNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function isResourceStatus(value: string): value is ResourceStatus {
  return (RESOURCE_STATUSES as readonly string[]).includes(value);
}

export type ContextResource = {
  id: string;
  userId: string;
  driveKey: string;
  path: string;
  name: string;
  ext: string | null;
  mime: string | null;
  sizeBytes: number | null;
  contentHash: string | null;
  kindId: string | null;
  subprojectId: string | null;
  tags: string[];
  status: ResourceStatus;
  ingestError: string | null;
  createdAt: string;
  updatedAt: string;
  ingestedAt: string | null;
};

export type ContextTopic = {
  id: string;
  userId: string;
  resourceId: string | null;
  subprojectId: string | null;
  parentId: string | null;
  path: string;
  ordinal: number;
  title: string;
  summary: string | null;
  depth: number;
  relatedTopicIds: string[];
  embedding: number[] | null;
  source: TopicSource;
  status: TopicStatus;
  mergedFromIds: string[] | null;
  createdAt: string;
  updatedAt: string;
};

export type ContextChunk = {
  id: string;
  userId: string;
  resourceId: string;
  parentTopicId: string;
  childTopicId: string | null;
  role: ChunkRole;
  ordinal: number;
  text: string;
  tokenEstimate: number;
  anchor: Record<string, unknown>;
  embedding: number[] | null;
  contentHash: string;
  createdAt: string;
};

export type ContextCard = {
  id: string;
  userId: string;
  resourceId: string;
  cardType: string;
  title: string;
  summary: string;
  outline: unknown;
  entities: unknown;
  constraints: unknown;
  projection: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};
