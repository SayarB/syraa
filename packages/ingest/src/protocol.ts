/**
 * Shared Redis queue protocol for Node (API) ↔ Python (ingest-worker).
 *
 * Queue: Redis list `everyday:ingest:queue` — LPUSH producer, BRPOP consumer.
 * Status: Redis hash `everyday:ingest:job:{jobId}`
 *
 * Job payload (JSON string on the list):
 * {
 *   jobId: string,
 *   userId: string,
 *   resourceId: string,
 *   driveKey: string,   // relative to DRIVE_ROOT
 *   filePath: string,   // absolute path for the worker
 *   mime: string,
 *   name: string
 * }
 */

export const INGEST_QUEUE_KEY = "everyday:ingest:queue";

export function ingestJobKey(jobId: string): string {
  return `everyday:ingest:job:${jobId}`;
}

export type IngestJobPayload = {
  jobId: string;
  userId: string;
  resourceId: string;
  driveKey: string;
  filePath: string;
  mime: string;
  name: string;
};

export type IngestJobPhase = "queued" | "processing" | "ready" | "failed";

export type IngestJobStatus = {
  jobId: string;
  userId: string;
  resourceId: string;
  status: IngestJobPhase;
  name: string;
  mime: string;
  error?: string;
  topicCount?: string;
  chunkCount?: string;
  bridgeCount?: string;
  leafCount?: string;
  embeddingProvider?: string;
  updatedAt: string;
};

export function parseJobPayload(raw: string): IngestJobPayload {
  const data = JSON.parse(raw) as Partial<IngestJobPayload>;
  if (
    !data.jobId ||
    !data.userId ||
    !data.resourceId ||
    !data.driveKey ||
    !data.filePath ||
    !data.mime ||
    !data.name
  ) {
    throw new Error("invalid ingest job payload");
  }
  return {
    jobId: data.jobId,
    userId: data.userId,
    resourceId: data.resourceId,
    driveKey: data.driveKey,
    filePath: data.filePath,
    mime: data.mime,
    name: data.name,
  };
}
