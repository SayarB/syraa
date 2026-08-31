import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import type { IncomingMessage } from "node:http";
import { pipeline } from "node:stream/promises";
import {
  absoluteDrivePath,
  buildUploadDriveKey,
  ensureParentDir,
  fileExtension,
  type IngestJobStatus,
  resolveDriveRoot,
} from "@everyday/ingest";
import Busboy from "busboy";
import { getContextStore, getIngestQueue } from "./context.js";

export type UploadIngestResult = {
  jobId: string;
  resourceId: string;
  name: string;
  mime: string;
  status: "queued";
};

type ParsedUpload = {
  filename: string;
  mime: string;
  sizeBytes: number;
  tmpPath: string;
};

function isPdf(filename: string, mime: string): boolean {
  const ext = fileExtension(filename);
  return ext === "pdf" || mime === "application/pdf" || mime === "application/x-pdf";
}

async function parseMultipartUpload(req: IncomingMessage): Promise<{
  userId?: string;
  file: ParsedUpload;
}> {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({
      headers: req.headers,
      limits: { files: 1, fileSize: 50 * 1024 * 1024 },
    });

    let userId: string | undefined;
    let filePromise: Promise<ParsedUpload> | null = null;
    let settled = false;

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    busboy.on("field", (name, value) => {
      if (name === "userId") userId = value;
    });

    busboy.on("file", (name, stream, info) => {
      if (name !== "file") {
        stream.resume();
        return;
      }
      if (filePromise) {
        stream.resume();
        fail(new Error("only one file is allowed"));
        return;
      }

      const { filename, mimeType } = info;
      const resourceTmp = randomUUID();
      const driveRoot = resolveDriveRoot();
      const tmpKey = `_incoming/${resourceTmp}/${filename || "upload.bin"}`;
      const tmpPath = absoluteDrivePath(driveRoot, tmpKey);

      filePromise = (async () => {
        await ensureParentDir(tmpPath);
        let sizeBytes = 0;
        stream.on("data", (chunk: Buffer) => {
          sizeBytes += chunk.length;
        });
        stream.on("limit", () => {
          fail(new Error("file too large (max 50MB)"));
        });
        await pipeline(stream, createWriteStream(tmpPath));
        return {
          filename: filename || "upload.bin",
          mime: mimeType || "application/octet-stream",
          sizeBytes,
          tmpPath,
        };
      })();
    });

    busboy.on("error", fail);
    busboy.on("finish", () => {
      if (settled) return;
      if (!filePromise) {
        fail(new Error("missing file field"));
        return;
      }
      filePromise
        .then((file) => {
          settled = true;
          resolve({ userId, file });
        })
        .catch(fail);
    });

    req.pipe(busboy);
  });
}

export async function handleIngestUpload(
  req: IncomingMessage,
  defaultUserId: string,
): Promise<UploadIngestResult> {
  const { rename } = await import("node:fs/promises");
  const parsed = await parseMultipartUpload(req);
  const userId = (parsed.userId?.trim() || defaultUserId).trim() || "demo-user";
  const { file } = parsed;

  if (!isPdf(file.filename, file.mime)) {
    const { unlink } = await import("node:fs/promises");
    await unlink(file.tmpPath).catch(() => undefined);
    throw new Error("only PDF uploads are supported");
  }

  const resourceId = randomUUID();
  const jobId = randomUUID();
  const driveRoot = resolveDriveRoot();
  const driveKey = buildUploadDriveKey(userId, resourceId, file.filename);
  const filePath = absoluteDrivePath(driveRoot, driveKey);
  await ensureParentDir(filePath);
  await rename(file.tmpPath, filePath);

  const { store } = await getContextStore();
  await store.createResource({
    id: resourceId,
    userId,
    driveKey,
    path: `/${driveKey}`,
    name: file.filename,
    ext: fileExtension(file.filename),
    mime: file.mime || "application/pdf",
    sizeBytes: file.sizeBytes,
  });

  const queue = await getIngestQueue();
  await queue.enqueue({
    jobId,
    userId,
    resourceId,
    driveKey,
    filePath,
    mime: file.mime || "application/pdf",
    name: file.filename,
  });

  return {
    jobId,
    resourceId,
    name: file.filename,
    mime: file.mime || "application/pdf",
    status: "queued",
  };
}

export async function getIngestJobStatus(jobId: string): Promise<IngestJobStatus | null> {
  const queue = await getIngestQueue();
  return queue.getStatus(jobId);
}
