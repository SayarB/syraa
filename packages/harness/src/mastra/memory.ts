import { Memory } from "@mastra/memory";
import { getMastraStorage } from "./storage.js";

let memory: Memory | null = null;

/** Shared Mastra Memory for Syraa chat threads (history + later WM). */
export function getSyraaMemory(): Memory {
  if (!memory) {
    memory = new Memory({
      storage: getMastraStorage(),
      options: {
        lastMessages: 40,
        semanticRecall: false,
      },
    });
  }
  return memory;
}

export function resetSyraaMemoryForTests(): void {
  memory = null;
}
