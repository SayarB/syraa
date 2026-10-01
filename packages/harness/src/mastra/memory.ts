import {
  type InputProcessor,
  type InputProcessorOrWorkflow,
  WorkingMemory,
} from "@mastra/core/processors";
import type { RequestContext } from "@mastra/core/request-context";
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

/**
 * Mastra's auto-added WorkingMemory input processor ignores `agentManaged: false`: it still
 * tells the model "You MUST call updateWorkingMemory in every response" while Memory withholds
 * that tool. The model then loops on other tools hunting for it and leaks the instruction into
 * replies. Swap in a read-only processor: same thread working memory, no update instructions.
 */
class SyraaMemory extends Memory {
  override async getInputProcessors(
    configuredProcessors: InputProcessorOrWorkflow[] = [],
    context?: RequestContext,
  ): Promise<InputProcessor[]> {
    const processors = await super.getInputProcessors(configuredProcessors, context);
    const index = processors.findIndex((processor) => processor.id === "working-memory");
    if (index === -1) return processors;
    const storage = await this.storage.getStore("memory");
    if (!storage) return processors;
    processors[index] = new WorkingMemory({
      storage,
      template: { format: "markdown", content: SYRAA_MEMORY_OPTIONS.workingMemory.template },
      scope: SYRAA_MEMORY_OPTIONS.workingMemory.scope,
      readOnly: true,
      templateProvider: this,
    });
    return processors;
  }
}

/** Shared Mastra Memory for Syraa chat threads (history + read-only thread WM). */
export function getSyraaMemory(): Memory {
  if (!memory) {
    memory = new SyraaMemory({ storage: getMastraStorage(), options: SYRAA_MEMORY_OPTIONS });
  }
  return memory;
}

export function resetSyraaMemoryForTests(): void {
  memory = null;
}
