import { createClient, type RedisClientType } from "redis";
import {
  INGEST_QUEUE_KEY,
  type IngestJobPayload,
  type IngestJobPhase,
  type IngestJobStatus,
  ingestJobKey,
} from "./protocol.js";

export type IngestQueue = {
  enqueue(job: IngestJobPayload): Promise<void>;
  getStatus(jobId: string): Promise<IngestJobStatus | null>;
  setStatus(
    jobId: string,
    fields: Partial<Omit<IngestJobStatus, "jobId">> & { status: IngestJobPhase },
  ): Promise<void>;
  close(): Promise<void>;
  readonly client: RedisClientType;
};

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function hashToStatus(jobId: string, hash: Record<string, string>): IngestJobStatus | null {
  if (!hash.status || !hash.userId || !hash.resourceId) return null;
  return {
    jobId,
    userId: hash.userId,
    resourceId: hash.resourceId,
    status: hash.status as IngestJobPhase,
    name: hash.name ?? "",
    mime: hash.mime ?? "",
    error: hash.error,
    topicCount: hash.topicCount,
    chunkCount: hash.chunkCount,
    bridgeCount: hash.bridgeCount,
    leafCount: hash.leafCount,
    embeddingProvider: hash.embeddingProvider,
    updatedAt: hash.updatedAt ?? nowIso(),
  };
}

export async function createIngestQueue(redisUrl?: string): Promise<IngestQueue> {
  const url = redisUrl ?? process.env.REDIS_URL ?? "redis://localhost:6379";
  const client = createClient({ url }) as RedisClientType;
  client.on("error", (err) => {
    console.error("[ingest-queue] redis error", err);
  });
  await client.connect();

  return {
    client,

    async enqueue(job) {
      const key = ingestJobKey(job.jobId);
      await client.hSet(key, {
        jobId: job.jobId,
        userId: job.userId,
        resourceId: job.resourceId,
        status: "queued",
        name: job.name,
        mime: job.mime,
        updatedAt: nowIso(),
      });
      await client.lPush(INGEST_QUEUE_KEY, JSON.stringify(job));
    },

    async getStatus(jobId) {
      const hash = await client.hGetAll(ingestJobKey(jobId));
      if (!hash || Object.keys(hash).length === 0) return null;
      return hashToStatus(jobId, hash);
    },

    async setStatus(jobId, fields) {
      const payload: Record<string, string> = {
        status: fields.status,
        updatedAt: nowIso(),
      };
      if (fields.userId) payload.userId = fields.userId;
      if (fields.resourceId) payload.resourceId = fields.resourceId;
      if (fields.name) payload.name = fields.name;
      if (fields.mime) payload.mime = fields.mime;
      if (fields.error !== undefined) payload.error = fields.error ?? "";
      if (fields.topicCount !== undefined) payload.topicCount = String(fields.topicCount);
      if (fields.chunkCount !== undefined) payload.chunkCount = String(fields.chunkCount);
      if (fields.bridgeCount !== undefined) payload.bridgeCount = String(fields.bridgeCount);
      if (fields.leafCount !== undefined) payload.leafCount = String(fields.leafCount);
      if (fields.embeddingProvider !== undefined) {
        payload.embeddingProvider = fields.embeddingProvider;
      }
      await client.hSet(ingestJobKey(jobId), payload);
    },

    async close() {
      await client.quit();
    },
  };
}
