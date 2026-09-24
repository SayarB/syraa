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

const cache = new Map<string, { expires: number; results: WebSearchResult[] }>();

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

function readCache(key: string): WebSearchResult[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expires <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.results;
}

function writeCache(key: string, results: WebSearchResult[]): void {
  cache.delete(key);
  cache.set(key, { expires: Date.now() + CACHE_TTL_MS, results });
  // Map keeps insertion order: evict the oldest entries past the cap.
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** Searches the web through SearXNG. Throws on HTTP errors, timeouts and bad responses. */
export async function searchWeb(
  query: string,
  opts: { limit: number },
): Promise<WebSearchResult[]> {
  const key = normalizeQuery(query);
  const cached = readCache(key);
  if (cached) return cached.slice(0, opts.limit);

  const url = new URL("/search", baseUrl());
  url.search = new URLSearchParams({ q: query.trim(), format: "json", safesearch: "1" }).toString();

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`searxng HTTP ${res.status}`);

  const results = normalizeResults(await res.json());
  writeCache(key, results);
  return results.slice(0, opts.limit);
}

export function clearWebSearchCacheForTests(): void {
  cache.clear();
}
