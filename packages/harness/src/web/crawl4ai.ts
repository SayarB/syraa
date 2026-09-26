import { createTtlCache } from "./ttl-cache.js";
import { assertPublicHttpUrl, resolvePublicRedirects } from "./url-guard.js";

/**
 * Client for the self-hosted Crawl4AI service behind the web_fetch tool. Returns a page's main
 * content as markdown ("fit" filter), capped so one page can't flood the model's context.
 */

export type PageRead = {
  url: string;
  content: string;
  truncated: boolean;
};

const REQUEST_TIMEOUT_MS = 20_000;
export const MAX_PAGE_CHARS = 12_000;

const cache = createTtlCache<PageRead>({ ttlMs: 10 * 60 * 1000, maxEntries: 100 });

export function isPageReadingConfigured(): boolean {
  return Boolean(process.env.CRAWL4AI_URL?.trim() && process.env.CRAWL4AI_API_TOKEN?.trim());
}

function config(): { baseUrl: string; token: string } {
  const baseUrl = process.env.CRAWL4AI_URL?.trim();
  const token = process.env.CRAWL4AI_API_TOKEN?.trim();
  if (!baseUrl || !token) throw new Error("CRAWL4AI_URL / CRAWL4AI_API_TOKEN are not set");
  return { baseUrl, token };
}

/**
 * Reads one public page. Throws BlockedUrlError for non-public URLs (checked before any request),
 * and a plain Error for HTTP failures, timeouts, and unreadable pages.
 */
export async function readPage(raw: string): Promise<PageRead> {
  const requested = await assertPublicHttpUrl(raw);
  const cached = cache.get(requested.href);
  if (cached) return cached;

  // Crawl4AI follows redirects on its own, so resolve them here first (each hop checked) and
  // only ever hand it the final public URL.
  const url = await resolvePublicRedirects(requested);

  const { baseUrl, token } = config();
  const res = await fetch(new URL("/md", baseUrl), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url: url.href, f: "fit" }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`crawl4ai HTTP ${res.status}`);

  const body = (await res.json()) as { markdown?: unknown; success?: unknown };
  const markdown = typeof body.markdown === "string" ? body.markdown.trim() : "";
  if (body.success === false || !markdown) throw new Error("crawl4ai returned no content");

  const page: PageRead = {
    url: url.href,
    content: markdown.slice(0, MAX_PAGE_CHARS),
    truncated: markdown.length > MAX_PAGE_CHARS,
  };
  cache.set(requested.href, page);
  return page;
}

export function clearPageCacheForTests(): void {
  cache.clear();
}
