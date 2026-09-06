import type { MemoryItem } from "@syraa/memory";
import { getContextStore } from "./context.js";
import { buildSystemPrompt, formatMaterialsOutline } from "./mastra/prompt.js";

export async function buildTurnInstructions(
  userId: string,
  memoryItems: MemoryItem[],
): Promise<string> {
  let materialsOutline = "No ingested materials yet.";
  try {
    const { store } = await getContextStore();
    const materials = await store.listMaterialsLayer1(userId);
    materialsOutline = formatMaterialsOutline(materials);
  } catch {
    // context store unavailable — prompt still works without materials block
  }
  return buildSystemPrompt(memoryItems, materialsOutline);
}
