import { createReadStream, existsSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join } from "node:path";
import { handleChat } from "./chat.js";
import { getContextStore } from "./context.js";
import { formatHarnessError } from "./errors.js";
import { getChatConfig } from "./llm.js";
import { getMemory, listMemoryForUser } from "./memory.js";
import {
  chatRequestSchema,
  createThreadRequestSchema,
  memoryItemPatchSchema,
  parseJsonBody,
  ValidationError,
} from "./schemas.js";
import {
  createChatThread,
  listChatThreads,
  listThreadMessages,
} from "./threads.js";
import { getIngestJobStatus, handleIngestUpload } from "./upload.js";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

export type HarnessServerOptions = {
  /** Optional static assets directory (e.g. apps/web/dist). */
  staticDir?: string;
};

function applyCors(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }
  return false;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function defaultUserId(req: IncomingMessage): string {
  const url = new URL(req.url ?? "/", "http://localhost");
  return url.searchParams.get("userId") ?? "demo-user";
}

async function serveStatic(
  staticDir: string,
  pathname: string,
  res: ServerResponse,
): Promise<boolean> {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  let filePath = join(staticDir, safePath);
  if (!filePath.startsWith(staticDir)) {
    return false;
  }
  if (!existsSync(filePath)) {
    // SPA fallback for client routes (no file extension)
    if (extname(safePath) === "") {
      filePath = join(staticDir, "index.html");
      if (!existsSync(filePath)) return false;
    } else {
      return false;
    }
  }
  const ext = extname(filePath);
  res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
  createReadStream(filePath).pipe(res);
  return true;
}

async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<void> {
  const { service } = await getMemory();
  const userId = defaultUserId(req);

  if (req.method === "GET" && pathname === "/api/health") {
    sendJson(res, 200, { status: "ok", service: "@syraa/harness", chat: getChatConfig() });
    return;
  }

  if (req.method === "GET" && pathname === "/api/config") {
    sendJson(res, 200, { chat: getChatConfig() });
    return;
  }

  if (req.method === "GET" && pathname === "/api/threads") {
    const url = new URL(req.url ?? "/", "http://localhost");
    const threads = await listChatThreads({
      userId,
      projectId: url.searchParams.get("projectId"),
      subprojectId: url.searchParams.get("subprojectId"),
    });
    sendJson(res, 200, { threads });
    return;
  }

  if (req.method === "POST" && pathname === "/api/threads") {
    const body = await parseJsonBody(await readBody(req), createThreadRequestSchema);
    const thread = await createChatThread({
      userId: body.userId ?? userId,
      title: body.title,
      projectId: body.projectId,
      subprojectId: body.subprojectId,
    });
    sendJson(res, 201, { thread });
    return;
  }

  if (req.method === "GET" && pathname.startsWith("/api/threads/")) {
    const threadId = pathname.slice("/api/threads/".length);
    if (!threadId || threadId.includes("/")) {
      sendJson(res, 400, { error: "thread id required" });
      return;
    }
    try {
      const result = await listThreadMessages({ userId, threadId });
      sendJson(res, 200, result);
    } catch (err) {
      if (err instanceof ValidationError) {
        sendJson(res, 404, { error: err.message });
        return;
      }
      throw err;
    }
    return;
  }

  if (req.method === "GET" && pathname === "/api/memory") {
    sendJson(res, 200, await listMemoryForUser(service, userId));
    return;
  }

  if (req.method === "POST" && pathname === "/api/chat") {
    const body = await parseJsonBody(await readBody(req), chatRequestSchema);
    const result = await handleChat({
      userId: body.userId ?? userId,
      message: body.message,
      messageId: body.messageId,
      threadId: body.threadId,
      projectId: body.projectId,
      subprojectId: body.subprojectId,
    });
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && pathname === "/api/ingest/upload") {
    try {
      const result = await handleIngestUpload(req, userId);
      sendJson(res, 202, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendJson(res, 400, { error: message });
    }
    return;
  }

  if (req.method === "GET" && pathname.startsWith("/api/ingest/jobs/")) {
    const jobId = pathname.slice("/api/ingest/jobs/".length);
    if (!jobId) {
      sendJson(res, 400, { error: "job id required" });
      return;
    }
    const status = await getIngestJobStatus(jobId);
    if (!status) {
      sendJson(res, 404, { error: "job not found" });
      return;
    }
    sendJson(res, 200, status);
    return;
  }

  if (req.method === "GET" && pathname === "/api/resources") {
    const { store } = await getContextStore();
    const resources = await store.listResources(userId);
    sendJson(res, 200, { resources });
    return;
  }

  if (
    req.method === "GET" &&
    pathname.startsWith("/api/resources/") &&
    pathname.endsWith("/tree")
  ) {
    const resourceId = pathname.slice("/api/resources/".length, -"/tree".length);
    if (!resourceId) {
      sendJson(res, 400, { error: "resource id required" });
      return;
    }
    const { store } = await getContextStore();
    const tree = await store.getResourceTopicTree(userId, resourceId);
    if (!tree) {
      sendJson(res, 404, { error: "resource not found" });
      return;
    }
    sendJson(res, 200, tree);
    return;
  }

  if (req.method === "GET" && pathname.startsWith("/api/resources/")) {
    const resourceId = pathname.slice("/api/resources/".length);
    const { store } = await getContextStore();
    const resource = await store.getResource(userId, resourceId);
    if (!resource) {
      sendJson(res, 404, { error: "resource not found" });
      return;
    }
    sendJson(res, 200, { resource });
    return;
  }

  if (req.method === "PATCH" && pathname.startsWith("/api/memory/items/")) {
    const itemId = pathname.slice("/api/memory/items/".length);
    const body = await parseJsonBody(await readBody(req), memoryItemPatchSchema);
    const item =
      body.status === "active"
        ? await service.updateItem(userId, itemId, { status: "active", needsConfirm: false })
        : await service.setItemStatus(userId, itemId, body.status);
    sendJson(res, 200, { item });
    return;
  }

  sendJson(res, 404, { error: "not found" });
}

export function createHarnessServer(options: HarnessServerOptions = {}) {
  const staticDir = options.staticDir;

  return createServer(async (req, res) => {
    try {
      if (applyCors(req, res)) return;
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname.startsWith("/api/")) {
        await handleApi(req, res, url.pathname);
        return;
      }
      if (staticDir) {
        const served = await serveStatic(staticDir, url.pathname, res);
        if (served) return;
      }
      sendJson(res, 404, { error: "not found" });
    } catch (err) {
      if (err instanceof ValidationError) {
        sendJson(res, 400, { error: err.message });
        return;
      }
      sendJson(res, 500, { error: formatHarnessError(err) });
    }
  });
}
