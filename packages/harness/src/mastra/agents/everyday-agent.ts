import { Agent } from "@mastra/core/agent";
import { requireChatModel } from "../model.js";
import { EVERYDAY_BASE_INSTRUCTIONS } from "../prompt.js";

export const EVERYDAY_AGENT_ID = "everyday-agent";

export function createEverydayAgent(): Agent {
  return new Agent({
    id: EVERYDAY_AGENT_ID,
    name: "Everyday Agent",
    description: "Chat agent for the Everyday dev harness with durable memory lessons.",
    instructions: EVERYDAY_BASE_INSTRUCTIONS,
    model: () => requireChatModel().mastraModel,
  });
}
