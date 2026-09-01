import { Agent } from "@mastra/core/agent";
import { getSyraaMemory } from "../memory.js";
import { requireChatModel } from "../model.js";
import { SYRAA_BASE_INSTRUCTIONS } from "../prompt.js";
import { syraaTools } from "../tools/materials-tools.js";

export const SYRAA_AGENT_ID = "syraa-agent";

export function createSyraaAgent(): Agent {
  return new Agent({
    id: SYRAA_AGENT_ID,
    name: "Syraa Agent",
    description: "Chat agent for the Syraa harness with Mastra Memory threads.",
    instructions: SYRAA_BASE_INSTRUCTIONS,
    model: () => requireChatModel().mastraModel,
    memory: getSyraaMemory(),
    tools: syraaTools,
  });
}
