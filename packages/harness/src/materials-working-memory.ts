import type { MaterialsLayer1Outline } from "@syraa/context";
import { getContextStore } from "./context.js";
import { getSyraaMemory } from "./mastra/memory.js";
import { formatMaterialsOutline } from "./mastra/prompt.js";

export function buildMaterialsWorkingMemoryContent(materials: MaterialsLayer1Outline[]): string {
  return [
    "# Session materials",
    "",
    "Document names and first topic layer only — not full document text.",
    "Ask which document/section to expand for the next layer.",
    "Do not invent quotes or page-level detail beyond this overview.",
    "",
    formatMaterialsOutline(materials),
  ].join("\n");
}

async function loadMaterialsLayer1(opts: {
  userId: string;
  projectId?: string | null;
  subprojectId?: string | null;
}): Promise<MaterialsLayer1Outline[]> {
  // Works scope: projectId/subprojectId reserved for future scoped retrieve.
  void opts.projectId;
  void opts.subprojectId;

  try {
    const { store } = await getContextStore();
    return await store.listMaterialsLayer1(opts.userId);
  } catch {
    return [];
  }
}

/**
 * Seed thread-scoped Mastra working memory with materials L1 outline.
 * Call when a chat thread is created (not on every turn).
 */
export async function seedMaterialsWorkingMemory(opts: {
  threadId: string;
  userId: string;
  projectId?: string | null;
  subprojectId?: string | null;
}): Promise<void> {
  const materials = await loadMaterialsLayer1(opts);
  const workingMemory = buildMaterialsWorkingMemoryContent(materials);
  const memory = getSyraaMemory();

  await memory.updateWorkingMemory({
    threadId: opts.threadId,
    resourceId: opts.userId,
    workingMemory,
  });
}
