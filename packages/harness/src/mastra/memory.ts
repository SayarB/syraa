import type { MastraCompositeStore } from "@mastra/core/storage";
import { Memory } from "@mastra/memory";
import { isHistoryCompactionEnabled } from "../history-state.js";
import { getMastraStorage } from "./storage.js";

let memory: Memory | null = null;

/** Messages loaded per turn when history is sent as it is. */
export const PLAIN_HISTORY_MESSAGES = 40;
/**
 * Messages loaded per turn when old turns are summarised. The history compaction processor cuts
 * what is loaded down to the summaries plus the newest turns, so this only has to reach back past
 * the turns that are not summarised yet.
 */
export const COMPACTED_HISTORY_MESSAGES = 400;

/**
 * Threads are isolated: history is this thread's messages, and nothing is recalled from other
 * threads (no semantic recall, no resource scope). Cross-conversation knowledge lives only in
 * product memory (@syraa/memory), and document summaries in the per-turn system prompt.
 *
 * Read when the memory is created, not at import: `.env` is loaded after imports in some entry points.
 */
export function syraaMemoryOptions() {
  return {
    lastMessages: isHistoryCompactionEnabled()
      ? COMPACTED_HISTORY_MESSAGES
      : PLAIN_HISTORY_MESSAGES,
    semanticRecall: false,
    // Off: it only duplicated the materials overview the system prompt rebuilds every turn, and
    // Mastra's working-memory instructions sent the model hunting for an update tool it never had.
    workingMemory: { enabled: false },
  } as const;
}

/** Syraa memory over the given storage (evals pass an in-memory store). */
export function createSyraaMemory(storage: MastraCompositeStore): Memory {
  return new Memory({ storage, options: syraaMemoryOptions() });
}

/** Shared Mastra Memory for Syraa chat threads (message history). */
export function getSyraaMemory(): Memory {
  if (!memory) {
    memory = createSyraaMemory(getMastraStorage());
  }
  return memory;
}

export function resetSyraaMemoryForTests(): void {
  memory = null;
}
