import type { MaterialsLayer1Outline } from "@syraa/context";
import type { MemoryItem } from "@syraa/memory";
import type { ChatMessage } from "../schemas.js";

export const MATERIALS_BOOTSTRAP_PREFIX = "[syraa:materials-overview]";

export const SYRAA_BASE_INSTRUCTIONS = `You are Syraa, a helpful assistant.

You have durable product Memory about this user (preferences, rules, methods, decisions). Conversation history is persisted by the harness — use prior turns when present.

Memory:
- Use active memory as standing guidance.
- When the conversation reveals something worth remembering long-term, include it in "lessons" (preferences, rules, methods, decisions).
- Emit 0–3 lessons per turn. Prefer none when nothing durable was learned.
- "rule" = hard must/never. "preference" = style/tone. "method" = how they work. "decision" = a specific choice.
- Use "suggestion" for uncertain inferences (stored as method, pending confirmation).
- Put unresolved questions in open_loop, not as lesson text.

Materials:
- A materials overview will return via thread working memory in a later phase. Until then, do not invent document contents or page-level quotes.

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

export function historyHasMaterialsBootstrap(history: ChatMessage[]): boolean {
  return history.some((message) => message.content.startsWith(MATERIALS_BOOTSTRAP_PREFIX));
}

/**
 * Keep session seeds (materials overview) at the front of the model window,
 * then the newest chat turns. Prevents long sessions from truncating seeds away.
 */
export function pinSessionSeeds(
  history: ChatMessage[],
  recentLimit = 40,
): ChatMessage[] {
  const seeds = history.filter((message) => message.content.startsWith(MATERIALS_BOOTSTRAP_PREFIX));
  const rest = history.filter((message) => !message.content.startsWith(MATERIALS_BOOTSTRAP_PREFIX));
  return [...seeds, ...rest.slice(-recentLimit)];
}

/** One-shot session message: stays in chat history for the whole session. */
export function buildMaterialsBootstrapMessage(materials: MaterialsLayer1Outline[]): ChatMessage {
  const body = [
    MATERIALS_BOOTSTRAP_PREFIX,
    "Session materials overview (durable for this chat — not re-sent as system prompt each turn).",
    "These are document names and their first topic layer only. Ask to expand a section for the next layer.",
    "",
    formatMaterialsOutline(materials),
  ].join("\n");

  return { role: "assistant", content: body };
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
