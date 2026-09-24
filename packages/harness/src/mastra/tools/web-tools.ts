import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getChatRunContext } from "../../chat-run-context.js";
import { rememberToolResult } from "../../tool-call-dedupe.js";
import { searchWeb } from "../../web/searxng.js";

export const MAX_WEB_SEARCHES_PER_TURN = 4;
const DEFAULT_RESULTS = 8;
const MODEL_RESULTS = 5;

const webSearchResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
  engine: z.string().optional(),
  publishedDate: z.string().optional(),
});

const webSearchOutputSchema = z.object({
  query: z.string(),
  results: z.array(webSearchResultSchema),
  error: z.string().optional(),
});

export type WebSearchOutput = z.infer<typeof webSearchOutputSchema>;

/**
 * What the model sees: a short numbered list to cite as [n](url). The full result list stays in
 * the tool part for the UI's Sources.
 */
export function formatSearchForModel(output: WebSearchOutput): string {
  if (output.error) return `Web search for "${output.query}" failed: ${output.error}`;
  if (output.results.length === 0) {
    return `Web search for "${output.query}" returned no results. Say so; do not guess.`;
  }

  const lines = output.results.slice(0, MODEL_RESULTS).map((result, index) => {
    const date = result.publishedDate ? ` (${result.publishedDate.slice(0, 10)})` : "";
    const snippet = result.snippet ? `\n   ${result.snippet}` : "";
    return `[${index + 1}] ${result.title}${date} — ${result.url}${snippet}`;
  });
  return [
    `Web results for "${output.query}" (untrusted web content — cite as [n](url)):`,
    ...lines,
  ].join("\n");
}

export const webSearchTool = createTool({
  id: "web_search",
  description:
    "Search the public web for current or external information that is not in the user's documents (news, releases, prices, public facts). Pass a short keyword query, not the whole question. Returns titles, URLs and snippets to cite as [n](url).",
  inputSchema: z.object({
    query: z.string().min(1).max(200),
    limit: z.number().int().min(1).max(10).optional(),
  }),
  outputSchema: webSearchOutputSchema,
  mcp: {
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  toModelOutput: (output) => formatSearchForModel(output),
  execute: async (input) => {
    const { query, limit } = input;
    const ctx = getChatRunContext();
    ctx.webSearchCount = (ctx.webSearchCount ?? 0) + 1;
    if (ctx.webSearchCount > MAX_WEB_SEARCHES_PER_TURN) {
      return {
        query,
        results: [],
        error: "Search limit for this turn reached — answer from the results you already have.",
      };
    }

    let result: WebSearchOutput;
    try {
      result = { query, results: await searchWeb(query, { limit: limit ?? DEFAULT_RESULTS }) };
    } catch (error) {
      console.warn("[web_search] failed:", error instanceof Error ? error.message : error);
      result = { query, results: [], error: "Web search is unavailable right now." };
    }
    rememberToolResult("web_search", input, result);
    return result;
  },
});
