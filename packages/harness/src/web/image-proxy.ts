import http, { type IncomingMessage } from "node:http";
import https from "node:https";
import { assertPublicHttpUrl, BlockedUrlError, guardedLookup } from "./url-guard.js";

/**
 * Fetches a public image on the browser's behalf, so pages never load third-party hosts directly
 * (no referrer or cookie leaks, no mixed-content or hotlink blocks, one place to enforce limits).
 * Every hop is checked against the same public-address rules as web_fetch.
 */

/** Raster formats only: SVG can carry script, and anything else isn't an image preview. */
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TOTAL_TIMEOUT_MS = 10_000;
/** Images are buffered in memory, so cap how many load at once (8 MB each, worst case). */
export const MAX_CONCURRENT_FETCHES = 32;

let inFlight = 0;

/** A failure the route can map straight to an HTTP status. */
export class ImageProxyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ImageProxyError";
  }
}

export type ImageResponse = {
  status: number;
  location?: string;
  contentType?: string;
  contentLength?: number;
  body: AsyncIterable<Uint8Array>;
  destroy(): void;
};

export type ImageRequester = (url: URL) => Promise<ImageResponse>;

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** One GET with redirects off; the connection only ever goes to an address the guard allowed. */
const requestOnce: ImageRequester = (url) =>
  new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const request = client.request(
      url,
      {
        method: "GET",
        lookup: guardedLookup as never,
        signal: AbortSignal.timeout(TOTAL_TIMEOUT_MS),
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; SyraaBot/1.0)",
          accept: "image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9",
        },
      },
      (response: IncomingMessage) => {
        const length = Number(firstHeader(response.headers["content-length"]));
        resolve({
          status: response.statusCode ?? 0,
          location: firstHeader(response.headers.location),
          contentType: firstHeader(response.headers["content-type"]),
          contentLength: Number.isFinite(length) ? length : undefined,
          body: response,
          destroy: () => response.destroy(),
        });
      },
    );
    request.on("error", reject);
    request.end();
  });

function mediaType(header: string | undefined): string {
  return (header ?? "").split(";")[0].trim().toLowerCase();
}

async function readCapped(response: ImageResponse): Promise<Buffer> {
  if (response.contentLength !== undefined && response.contentLength > MAX_IMAGE_BYTES) {
    response.destroy();
    throw new ImageProxyError("That image is too large.", 413);
  }
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of response.body) {
      total += chunk.byteLength;
      if (total > MAX_IMAGE_BYTES) {
        response.destroy();
        throw new ImageProxyError("That image is too large.", 413);
      }
      chunks.push(Buffer.from(chunk));
    }
  } catch (error) {
    if (error instanceof ImageProxyError) throw error;
    throw new ImageProxyError("Couldn't load that image.", 502);
  }
  return Buffer.concat(chunks);
}

async function loadImage(
  raw: string,
  request: ImageRequester,
): Promise<{ contentType: string; body: Buffer }> {
  let current = await assertPublicHttpUrl(raw);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let response: ImageResponse;
    try {
      response = await request(current);
    } catch (error) {
      if (error instanceof BlockedUrlError) throw error;
      throw new ImageProxyError("Couldn't load that image.", 502);
    }

    if (response.status >= 300 && response.status < 400 && response.location) {
      response.destroy();
      // Re-check each hop: a public link must not bounce us to an internal address.
      current = await assertPublicHttpUrl(new URL(response.location, current).href);
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      response.destroy();
      throw new ImageProxyError("Couldn't load that image.", 502);
    }

    const contentType = mediaType(response.contentType);
    if (!ALLOWED_TYPES.has(contentType)) {
      response.destroy();
      throw new ImageProxyError("That isn't a supported image.", 415);
    }
    return { contentType, body: await readCapped(response) };
  }
  throw new ImageProxyError("That image redirects too many times.", 502);
}

/**
 * Returns the bytes and media type of a public raster image. Throws BlockedUrlError for non-public
 * URLs and ImageProxyError (with an HTTP status) for everything else, including 429 when too many
 * images are already loading.
 */
export async function fetchPublicImage(
  raw: string,
  request: ImageRequester = requestOnce,
): Promise<{ contentType: string; body: Buffer }> {
  if (inFlight >= MAX_CONCURRENT_FETCHES) {
    throw new ImageProxyError("Too many images are loading. Try again in a moment.", 429);
  }
  inFlight += 1;
  try {
    return await loadImage(raw, request);
  } finally {
    inFlight -= 1;
  }
}
