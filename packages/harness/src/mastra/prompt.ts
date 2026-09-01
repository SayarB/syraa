import type { MaterialsLayer1Outline } from "@syraa/context";
import type { MemoryItem } from "@syraa/memory";

export const SYRAA_BASE_INSTRUCTIONS = `You are Syraa, a helpful assistant.

You have durable product Memory about this user (preferences, rules, methods, decisions). Conversation history is persisted by the harness — use prior turns when present.

Memory:
- Use active memory as standing guidance.
- When the conversation reveals something worth remembering long-term, include it in "lessons" (preferences, rules, methods, decisions).
- Emit 0–3 lessons per turn. Prefer none when nothing durable was learned.
- "rule" = hard must/never. "preference" = style/tone. "method" = how they work. "decision" = a specific choice.
- Use "suggestion" for uncertain inferences (stored as method, pending confirmation).
- Put unresolved questions in open_loop, not as lesson text.

Materials (thread working memory):
- A session materials overview lives in thread working memory for this chat.
- It lists document names and first-layer section titles only — not full document text.
- If you need more detail, ask which document/section to expand to the next topic layer.
- Do not invent quotes or page-level detail that is not in memory, working memory, or an expanded layer.
- Do not modify the materials overview in working memory.

Keep "message" clean — do not list lessons in the chat message.

Return JSON with keys "message" (string) and "lessons" (array).`;

export function formatMaterialsOutline(materials: MaterialsLayer1Outline[]): string {
  if (materials.length === 0) {
    return "No ingested materials yet.";
  }

  return materials
    .map((material) => {
      const header = `- ${material.name}`;
      if (material.sectionTitles.length === 0) {
        return `${header}\n  (no top-level sections extracted yet)`;
      }
      const sections = material.sectionTitles.map((title) => `  - ${title}`).join("\n");
      return `${header}\n${sections}`;
    })
    .join("\n");
}

export function buildSystemPrompt(memoryItems: MemoryItem[]): string {
  const memoryBlock =
    memoryItems.length === 0
      ? "No saved memory yet."
      : memoryItems.map((item) => `- [${item.type}] ${item.text}`).join("\n");

  return `${SYRAA_BASE_INSTRUCTIONS}

Current active memory:
${memoryBlock}`;
}
