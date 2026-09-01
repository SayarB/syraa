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

const MAX_CHARS = 24_000;

export const listMaterialsTool = createTool({
  id: "list_materials",
  description:
    "List ingested documents and their top-level section titles for the current user.",
  inputSchema: z.object({}),
  execute: async () => {
    const { userId } = getChatRunContext();
    const { store } = await getContextStore();
    const materials = await store.listMaterialsLayer1(userId);
    return {
      materials: materials.map((material) => ({
        documentName: material.name,
        resourceId: material.resourceId,
        status: material.status,
        sectionTitles: material.sectionTitles,
      })),
    };
  },
});

export const readMaterialsSectionTool = createTool({
  id: "read_materials_section",
  description:
    "Read text from an ingested document. Pass documentName and optional sectionTitle from the materials overview. Omit sectionTitle to read the whole document (may truncate).",
  inputSchema: z.object({
    documentName: z.string().min(1),
    sectionTitle: z.string().min(1).optional(),
  }),
  execute: async (input) => {
    const { userId } = getChatRunContext();
    const { store } = await getContextStore();
    const materials = await store.listMaterialsLayer1(userId);
    const resourceId = resolveResourceIdByName(materials, input.documentName);
    if (!resourceId) {
      return {
        error: `No ingested document matching "${input.documentName}".`,
        availableDocuments: materials.map((material) => material.name),
      };
    }

    const treeResult = await store.getResourceTopicTree(userId, resourceId);
    if (!treeResult) {
      return { error: "Document not found or not ready." };
    }

    if (input.sectionTitle) {
      const match = findSectionContent(treeResult.tree, input.sectionTitle);
      if (!match) {
        const outline = materials.find((material) => material.resourceId === resourceId);
        return {
          error: `Section not found: "${input.sectionTitle}"`,
          document: treeResult.resource.name,
          topSections: outline?.sectionTitles ?? [],
        };
      }
      const { text, truncated } = joinTextsWithLimit(match.texts, MAX_CHARS);
      return {
        document: treeResult.resource.name,
        section: match.matchedTitle,
        text,
        truncated,
      };
    }

    const allTexts = findAllDocumentText(treeResult.tree);
    const { text, truncated } = joinTextsWithLimit(allTexts, MAX_CHARS);
    return {
      document: treeResult.resource.name,
      section: "(entire document)",
      text,
      truncated,
      chunkCount: allTexts.length,
    };
  },
});

export const syraaTools = {
  list_materials: listMaterialsTool,
  read_materials_section: readMaterialsSectionTool,
};
