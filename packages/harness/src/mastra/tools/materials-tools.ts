import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getContextStore } from "../../context.js";
import { getChatRunContext } from "../../chat-run-context.js";
import {
  findAllDocumentText,
  findSectionContent,
  joinTextsWithLimit,
  resolveResourceIdByName,
} from "../../materials-retrieve.js";
import { rememberToolResult } from "../../tool-call-dedupe.js";

const MAX_CHARS = 24_000;

export const listMaterialsTool = createTool({
  id: "list_materials",
  description: "List all ingested documents and their top-level section titles.",
  inputSchema: z.object({}),
  mcp: {
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
  },
  execute: async () => {
    const { userId } = getChatRunContext();
    const { store } = await getContextStore();
    const materials = await store.listMaterialsLayer1(userId);
    const result = {
      materials: materials.map((material) => ({
        documentName: material.name,
        resourceId: material.resourceId,
        status: material.status,
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
  execute: async (input) => {
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
  list_materials: listMaterialsTool,
  read_materials_section: readMaterialsSectionTool,
};
