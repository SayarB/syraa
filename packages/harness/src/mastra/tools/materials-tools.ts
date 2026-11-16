import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getChatRunContext } from "../../chat-run-context.js";
import { getContextStore } from "../../context.js";
import {
  findAllDocumentText,
  findSectionContent,
  joinTextsWithLimit,
  resolveResourceIdByName,
} from "../../materials-retrieve.js";
import { rememberToolResult, repeatedToolResult } from "../../tool-call-dedupe.js";
import { jsonWithUntrusted, textForModel, wrapUntrusted } from "../../untrusted.js";

const MAX_CHARS = 24_000;

/** The tools return differently shaped objects, so the formatters read them by key. */
type ToolResult = Record<string, unknown>;

/**
 * What the model sees. Everything that came out of an uploaded document — passages, document
 * names, section titles — is fenced as untrusted data; our own errors and notes stay outside the
 * block. The full result stays in the tool part for the UI.
 */
export function formatSearchMaterialsForModel(output: ToolResult): string {
  return jsonWithUntrusted("the user's documents (search results)", output, [
    "hits",
    "availableDocuments",
  ]);
}

export function formatListMaterialsForModel(output: ToolResult): string {
  return jsonWithUntrusted("the user's documents (names and sections)", output, ["materials"]);
}

export function formatSectionForModel(output: ToolResult): string {
  // An error or "section not found" result: our message stays outside, the names inside.
  if (typeof output.text !== "string") {
    return jsonWithUntrusted("the user's documents (names and sections)", output, [
      "document",
      "availableDocuments",
      "topSections",
    ]);
  }

  // A document section: the text is fenced, and so are its document and section names (they go
  // into the block's label). Only counters like `truncated` stay outside.
  const { text, document, section, ...counters } = output;
  const source = `document "${document}", section "${section}"`;
  return `${JSON.stringify(counters)}\n${wrapUntrusted(source, text)}`;
}

export const searchMaterialsTool = createTool({
  id: "search_materials",
  description:
    "Search all ingested documents for passages matching a name, topic, or phrase. Use for 'what do you know about X', 'find mentions of X', and cross-document questions. Prefer this over list_materials + read_materials_section when the target document is unknown. Pass the name or topic itself as the query (e.g. 'madverse', not the whole question). Empty hits means the materials do not mention it.",
  inputSchema: z.object({
    query: z.string().min(1).max(300),
    limit: z.number().int().min(1).max(20).optional(),
    documentName: z.string().min(1).optional(),
  }),
  mcp: {
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
  },
  toModelOutput: (output) => textForModel(formatSearchMaterialsForModel(output as ToolResult)),
  execute: async (input) => {
    const repeat = repeatedToolResult("search_materials", input);
    if (repeat) return repeat;
    const { userId } = getChatRunContext();
    const { store } = await getContextStore();

    let resourceIds: string[] | undefined;
    if (input.documentName) {
      // Name lookup only — not capped at the 50 newest like the materials outline.
      const materials = (await store.listResources(userId, 1000))
        .filter((resource) => resource.status === "ready")
        .map((resource) => ({ resourceId: resource.id, name: resource.name }));
      const resourceId = resolveResourceIdByName(materials, input.documentName);
      if (!resourceId) {
        const result = {
          error: `No ingested document matching "${input.documentName}".`,
          availableDocuments: materials.slice(0, 50).map((material) => material.name),
        };
        rememberToolResult("search_materials", input, result);
        return result;
      }
      resourceIds = [resourceId];
    }

    const { hits } = await store.searchMaterials(userId, {
      query: input.query,
      limit: input.limit,
      resourceIds,
    });
    const exactMatches = hits.filter((hit) => hit.matchedBy.includes("lexical")).length;
    const result = {
      query: input.query,
      hits: hits.map((hit) => ({
        documentName: hit.documentName,
        section: hit.sectionTitle,
        snippet: hit.snippet,
        score: Number(hit.score.toFixed(4)),
        exactMatch: hit.matchedBy.includes("lexical"),
      })),
      ...(hits.length === 0
        ? {
            note: input.documentName
              ? `No passage in "${input.documentName}" mentions "${input.query}". Other documents were not searched.`
              : `No passage in the user's materials mentions "${input.query}".`,
          }
        : exactMatches === 0
          ? {
              note: `No passage contains "${input.query}" verbatim; these are loose meaning-based matches and may be unrelated.`,
            }
          : {}),
    };
    rememberToolResult("search_materials", input, result);
    return result;
  },
});

export const listMaterialsTool = createTool({
  id: "list_materials",
  description:
    "List all ingested documents with their summary and full list of top-level section titles.",
  inputSchema: z.object({}),
  mcp: {
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
  },
  toModelOutput: (output) => textForModel(formatListMaterialsForModel(output as ToolResult)),
  execute: async () => {
    const repeat = repeatedToolResult("list_materials", {});
    if (repeat) return repeat;
    const { userId } = getChatRunContext();
    const { store } = await getContextStore();
    const materials = await store.listMaterialsLayer1(userId);
    const result = {
      materials: materials.map((material) => ({
        documentName: material.name,
        resourceId: material.resourceId,
        status: material.status,
        summary: material.summary,
        sectionTitles: material.sectionTitles,
      })),
    };
    rememberToolResult("list_materials", {}, result);
    return result;
  },
});

export const readMaterialsSectionTool = createTool({
  id: "read_materials_section",
  description:
    "Read text from an ingested document. Pass documentName and optional sectionTitle. Omit sectionTitle to read the whole document (may truncate).",
  inputSchema: z.object({
    documentName: z.string().min(1),
    sectionTitle: z.string().min(1).optional(),
  }),
  mcp: {
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
  },
  toModelOutput: (output) => textForModel(formatSectionForModel(output as ToolResult)),
  execute: async (input) => {
    const repeat = repeatedToolResult("read_materials_section", input);
    if (repeat) return repeat;
    const { userId } = getChatRunContext();
    const { store } = await getContextStore();
    const materials = await store.listMaterialsLayer1(userId);
    const resourceId = resolveResourceIdByName(materials, input.documentName);
    if (!resourceId) {
      const result = {
        error: `No ingested document matching "${input.documentName}".`,
        availableDocuments: materials.map((material) => material.name),
      };
      rememberToolResult("read_materials_section", input, result);
      return result;
    }

    const treeResult = await store.getResourceTopicTree(userId, resourceId);
    if (!treeResult) {
      const result = { error: "Document not found or not ready." };
      rememberToolResult("read_materials_section", input, result);
      return result;
    }

    if (input.sectionTitle) {
      const match = findSectionContent(treeResult.tree, input.sectionTitle);
      if (!match) {
        const outline = materials.find((material) => material.resourceId === resourceId);
        const result = {
          error: `Section not found: "${input.sectionTitle}"`,
          document: treeResult.resource.name,
          topSections: outline?.sectionTitles ?? [],
        };
        rememberToolResult("read_materials_section", input, result);
        return result;
      }
      const { text, truncated } = joinTextsWithLimit(match.texts, MAX_CHARS);
      const result = {
        document: treeResult.resource.name,
        section: match.matchedTitle,
        text,
        truncated,
      };
      rememberToolResult("read_materials_section", input, result);
      return result;
    }

    const allTexts = findAllDocumentText(treeResult.tree);
    const { text, truncated } = joinTextsWithLimit(allTexts, MAX_CHARS);
    const result = {
      document: treeResult.resource.name,
      section: "(entire document)",
      text,
      truncated,
      chunkCount: allTexts.length,
    };
    rememberToolResult("read_materials_section", input, result);
    return result;
  },
});

export const syraaTools = {
  search_materials: searchMaterialsTool,
  list_materials: listMaterialsTool,
  read_materials_section: readMaterialsSectionTool,
};
