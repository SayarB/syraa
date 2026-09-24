import { Agent } from "@mastra/core/agent";
import { ToolCallFilter } from "@mastra/core/processors";
import { isWebSearchConfigured } from "../../web/searxng.js";
import { getSyraaMemory } from "../memory.js";
import { requireChatModel } from "../model.js";
import { SYRAA_BASE_INSTRUCTIONS } from "../prompt.js";
import { StripFootersProcessor } from "../strip-footers-processor.js";
import { StripReasoningProcessor } from "../strip-reasoning-processor.js";
import { syraaTools } from "../tools/materials-tools.js";
import { getMyMemoryTool } from "../tools/memory-tools.js";
import { webSearchTool } from "../tools/web-tools.js";

export const SYRAA_AGENT_ID = "syraa-agent";

export function createSyraaAgent(): Agent {
  return new Agent({
    id: SYRAA_AGENT_ID,
    name: "Syraa Agent",
    description: "Chat agent for the Syraa harness with Mastra Memory threads.",
    instructions: SYRAA_BASE_INSTRUCTIONS,
    model: () => requireChatModel().mastraModel,
    memory: getSyraaMemory(),
    tools: {
      ...syraaTools,
      get_my_memory: getMyMemoryTool,
      ...(isWebSearchConfigured() ? { web_search: webSearchTool } : {}),
    },
    inputProcessors: [
      new StripReasoningProcessor(),
      // Earlier turns' web results are stale: drop them from the prompt. Transient — stored
      // messages and the UI keep them; the current turn still sees its own results.
      new ToolCallFilter({ exclude: ["web_search", "web_fetch"] }),
    ],
    outputProcessors: [new StripFootersProcessor(), new StripReasoningProcessor()],
  });
}
