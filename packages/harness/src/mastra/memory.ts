import type { MastraCompositeStore } from "@mastra/core/storage";
import { Memory } from "@mastra/memory";
import { getMastraStorage } from "./storage.js";

let memory: Memory | null = null;

/** Messages of history sent per turn when a user has turned compaction off. */
export const PLAIN_HISTORY_MESSAGES = 40;
/**
 * Messages of history loaded per turn. The history compaction processor cuts this down to the
 * summaries plus the newest turns (or to the last 40 messages when a user has turned compaction
 * off), so it only has to reach back past the turns that are not summarised yet.
 */
export const HISTORY_LOAD_MESSAGES = 400;

/**
 * Threads are isolated: history is this thread's messages, and nothing is recalled from other
 * threads (no semantic recall, no resource scope). Cross-conversation knowledge lives only in
 * product memory (@syraa/memory), and document summaries in the per-turn system prompt.
 */
export const SYRAA_MEMORY_OPTIONS = {
  lastMessages: HISTORY_LOAD_MESSAGES,
  semanticRecall: false,
  // Off: it only duplicated the materials overview the system prompt rebuilds every turn, and
  // Mastra's working-memory instructions sent the model hunting for an update tool it never had.
  workingMemory: { enabled: false },
} as const;

/** Syraa memory over the given storage (evals pass an in-memory store). */
export function createSyraaMemory(storage: MastraCompositeStore): Memory {
  return new Memory({ storage, options: SYRAA_MEMORY_OPTIONS });
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
