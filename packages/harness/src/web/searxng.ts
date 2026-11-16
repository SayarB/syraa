import { createTtlCache } from "./ttl-cache.js";

/**
 * Client for the self-hosted SearXNG instance behind the web_search tool (docker/searxng).
 * Results are normalised for citation and cached briefly so repeated queries don't re-hit
 * the upstream engines (which throttle a datacenter IP quickly).
 */

export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
  engine?: string;
  publishedDate?: string;
};

type SearxngResult = {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  engine?: unknown;
  publishedDate?: unknown;
};

const REQUEST_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
const MAX_SNIPPET_CHARS = 300;
const MAX_RESULTS = 10;
const MAX_IMAGE_TITLE_CHARS = 120;

const cache = createTtlCache<WebSearchResult[]>({
  ttlMs: CACHE_TTL_MS,
  maxEntries: CACHE_MAX_ENTRIES,
});

export function isWebSearchConfigured(): boolean {
  return Boolean(process.env.SEARXNG_URL?.trim());
}

function baseUrl(): string {
  const url = process.env.SEARXNG_URL?.trim();
  if (!url) throw new Error("SEARXNG_URL is not set");
  return url;
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/** Keeps http(s) results with a title, drops duplicate URLs, trims snippets. */
export function normalizeResults(body: unknown): WebSearchResult[] {
  const raw = (body as { results?: unknown })?.results;
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const results: WebSearchResult[] = [];
  for (const item of raw as SearxngResult[]) {
    const url = asText(item.url);
    const title = asText(item.title);
    if (!url || !title || !isHttpUrl(url) || seen.has(url)) continue;
    seen.add(url);

    const result: WebSearchResult = {
      title,
      url,
      snippet: truncate(asText(item.content), MAX_SNIPPET_CHARS),
    };
    const engine = asText(item.engine);
    if (engine) result.engine = engine;
    const publishedDate = asText(item.publishedDate);
    if (publishedDate) result.publishedDate = publishedDate;
    results.push(result);

    if (results.length >= MAX_RESULTS) break;
  }
  return results;
}

/** One SearXNG query. Throws on HTTP errors, timeouts and bad responses. */
async function querySearxng(query: string, extra: Record<string, string> = {}): Promise<unknown> {
  const url = new URL("/search", baseUrl());
  url.search = new URLSearchParams({
    q: query.trim(),
    format: "json",
    safesearch: "1",
    ...extra,
  }).toString();

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`searxng HTTP ${res.status}`);
  return res.json();
}

/** Throws when an empty page is an engine outage (CAPTCHAs); returns normally for a real miss. */
function assertNotOutage(body: unknown): void {
  const unresponsive = (body as { unresponsive_engines?: unknown[] })?.unresponsive_engines;
  if (Array.isArray(unresponsive) && unresponsive.length > 0) {
    throw new Error(`searxng: no results, ${unresponsive.length} engine(s) unresponsive`);
  }
}

/** Searches the web through SearXNG. Throws on HTTP errors, timeouts and bad responses. */
export async function searchWeb(
  query: string,
  opts: { limit: number },
): Promise<WebSearchResult[]> {
  const key = normalizeQuery(query);
  const cached = cache.get(key);
  if (cached) return cached.slice(0, opts.limit);

  const body = await querySearxng(query);
  const results = normalizeResults(body);
  if (results.length === 0) {
    // Nothing is cached for empty results: they are often a temporary engine outage (CAPTCHAs).
    assertNotOutage(body);
    return [];
  }
  cache.set(key, results);
  return results.slice(0, opts.limit);
}

export type ImageSearchResult = {
  title: string;
  /** Full-size image. Shown through the image proxy, never loaded by the browser directly. */
  imageUrl: string;
  /** Small preview; falls back to imageUrl when the engine gave none. */
  thumbUrl: string;
  /** The page the image was found on. */
  sourceUrl: string;
};

const imageCache = createTtlCache<ImageSearchResult[]>({
  ttlMs: CACHE_TTL_MS,
  maxEntries: CACHE_MAX_ENTRIES,
});

/** Keeps http(s) image results with a title, drops duplicate images, and trims titles. */
export function normalizeImageResults(body: unknown): ImageSearchResult[] {
  const raw = (body as { results?: unknown })?.results;
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const results: ImageSearchResult[] = [];
  for (const item of raw as Array<Record<string, unknown>>) {
    const imageUrl = asText(item.img_src);
    if (!imageUrl || !isHttpUrl(imageUrl) || seen.has(imageUrl)) continue;
    seen.add(imageUrl);

    const thumb = asText(item.thumbnail_src) || asText(item.thumbnail);
    const sourceUrl = asText(item.url);
    results.push({
      title: truncate(asText(item.title) || "Image", MAX_IMAGE_TITLE_CHARS),
      imageUrl,
      thumbUrl: thumb && isHttpUrl(thumb) ? thumb : imageUrl,
      sourceUrl: sourceUrl && isHttpUrl(sourceUrl) ? sourceUrl : imageUrl,
    });
    if (results.length >= MAX_RESULTS) break;
  }
  return results;
}

/** Searches for images through SearXNG's images category. Same failure modes as searchWeb. */
export async function searchImages(
  query: string,
  opts: { limit: number },
): Promise<ImageSearchResult[]> {
  const key = normalizeQuery(query);
  const cached = imageCache.get(key);
  if (cached) return cached.slice(0, opts.limit);

  const body = await querySearxng(query, { categories: "images" });
  const results = normalizeImageResults(body);
  if (results.length === 0) {
    assertNotOutage(body);
    return [];
  }
  imageCache.set(key, results);
  return results.slice(0, opts.limit);
}

export function clearWebSearchCacheForTests(): void {
  cache.clear();
  imageCache.clear();
}
