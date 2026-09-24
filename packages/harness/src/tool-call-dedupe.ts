import { getChatRunContext } from "./chat-run-context.js";

export function toolCallCacheKey(toolId: string, input: unknown): string {
  return `${toolId}:${JSON.stringify(input ?? {})}`;
}

/** Record a successful tool result for turn-end fallback only — does not block later tool calls. */
export function rememberToolResult(toolId: string, input: unknown, result: unknown): void {
  const ctx = getChatRunContext();
  if (!ctx.toolCallCache) ctx.toolCallCache = new Map();
  ctx.toolCallCache.set(toolCallCacheKey(toolId, input), result);
}

export function getRememberedToolResult(toolId: string, input: unknown): unknown | undefined {
  return getChatRunContext().toolCallCache?.get(toolCallCacheKey(toolId, input));
}

type MaterialsListOutput = {
  materials?: Array<{ documentName?: string }>;
};

type ReadMaterialsOutput = {
  document?: string;
  section?: string;
  text?: string;
  error?: string;
};

function fallbackFromReadMaterialsCache(): { message: string } | null {
  try {
    const cache = getChatRunContext().toolCallCache;
    if (!cache) return null;

    let best: ReadMaterialsOutput | null = null;
    for (const [key, value] of cache.entries()) {
      if (!key.startsWith("read_materials_section:")) continue;
      const output = value as ReadMaterialsOutput;
      if (output.error || !output.text?.trim()) continue;
      best = output;
    }

    if (!best?.text) return null;

    const header = best.document
      ? `From **${best.document}**${best.section ? ` (${best.section})` : ""}:\n\n`
      : "";
    return {
      message: `${header}${best.text.trim().slice(0, 4000)}`,
    };
  } catch {
    return null;
  }
}

type SearchMaterialsOutput = {
  hits?: Array<{ documentName?: string; section?: string; snippet?: string }>;
};

/** Latest search_materials call with hits → its top snippets, labelled by document and section. */
function fallbackFromSearchMaterialsCache(): { message: string } | null {
  try {
    const cache = getChatRunContext().toolCallCache;
    if (!cache) return null;

    let hits: NonNullable<SearchMaterialsOutput["hits"]> = [];
    for (const [key, value] of cache.entries()) {
      if (!key.startsWith("search_materials:")) continue;
      const found = ((value as SearchMaterialsOutput).hits ?? []).filter((hit) =>
        hit.snippet?.trim(),
      );
      if (found.length > 0) hits = found;
    }
    if (hits.length === 0) return null;

    const lines = hits.slice(0, 3).map((hit) => {
      const where = [hit.documentName, hit.section].filter(Boolean).join(" — ");
      return `- ${where ? `**${where}**: ` : ""}${hit.snippet?.trim()}`;
    });
    return { message: `Relevant passages from your materials:\n${lines.join("\n")}` };
  } catch {
    return null;
  }
}

/** When the agent hits maxSteps without text, recover from tool results if we have them. */
export function fallbackTurnFromToolCache(): { message: string } {
  try {
    const fromRead = fallbackFromReadMaterialsCache();
    if (fromRead) return fromRead;

    const fromSearch = fallbackFromSearchMaterialsCache();
    if (fromSearch) return fromSearch;

    const cached = getRememberedToolResult("list_materials", {}) as MaterialsListOutput | undefined;
    const materials = cached?.materials ?? [];
    if (materials.length > 0) {
      const names = materials
        .map((material) => material.documentName?.trim())
        .filter((name): name is string => Boolean(name));
      if (names.length > 0) {
        return {
          message: `Available documents:\n${names.map((name) => `- ${name}`).join("\n")}`,
        };
      }
    }
  } catch {
    // no chat run context
  }

  return {
    message: "I couldn't finish that turn — please try again.",
  };
}
