import { Memory } from "@mastra/memory";
import { getMastraStorage } from "./storage.js";

let memory: Memory | null = null;

/** Shared Mastra Memory for Syraa chat threads (history + thread WM). */
export function getSyraaMemory(): Memory {
  if (!memory) {
    memory = new Memory({
      storage: getMastraStorage(),
      options: {
        lastMessages: 40,
        semanticRecall: false,
        workingMemory: {
          enabled: true,
          scope: "thread",
          // Harness seeds materials L1; agent must not overwrite the overview.
          agentManaged: false,
        },
      },
    });
  }
  return memory;
}

export function resetSyraaMemoryForTests(): void {
  memory = null;
}
