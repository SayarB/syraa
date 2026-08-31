import { Agent } from "@mastra/core/agent";
import { requireChatModel } from "../model.js";
import { SYRAA_BASE_INSTRUCTIONS } from "../prompt.js";

export const SYRAA_AGENT_ID = "syraa-agent";

export function createSyraaAgent(): Agent {
  return new Agent({
    id: SYRAA_AGENT_ID,
    name: "Syraa Agent",
    description: "Chat agent for the Syraa dev harness with durable memory lessons.",
    instructions: SYRAA_BASE_INSTRUCTIONS,
    model: () => requireChatModel().mastraModel,
  });
}
