import { Memory } from "@mastra/memory";
import { getMastraStorage } from "./storage.js";

let memory: Memory | null = null;

/**
 * Threads are isolated: history is this thread's last messages, working memory is per thread,
 * and nothing is recalled from other threads (no semantic recall, no resource scope).
 * Cross-conversation knowledge lives only in product memory (@syraa/memory), shown in the prompt.
 */
export const SYRAA_MEMORY_OPTIONS = {
  lastMessages: 40,
  semanticRecall: false,
  workingMemory: {
    enabled: true,
    scope: "thread",
    // Harness seeds materials L1; agent must not overwrite the overview.
    agentManaged: false,
    // Avoid Mastra state-signal recap pressure; product memory is @syraa/memory.
    useStateSignals: false,
    template: `# Session materials

Document names and top-level section titles only — not full text.
User prefs/rules are in product memory, not here.`,
  },
} as const;

/** Shared Mastra Memory for Syraa chat threads (history + thread WM). */
export function getSyraaMemory(): Memory {
  if (!memory) {
    memory = new Memory({ storage: getMastraStorage(), options: SYRAA_MEMORY_OPTIONS });
  }
  return memory;
}

export function resetSyraaMemoryForTests(): void {
  memory = null;
}
