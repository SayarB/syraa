import { Mastra } from "@mastra/core";
import type { Agent } from "@mastra/core/agent";
import { createSyraaAgent } from "./agents/syraa-agent.js";

let mastra: Mastra<{ syraa: Agent }> | null = null;

export function getMastra(): Mastra<{ syraa: Agent }> {
  if (!mastra) {
    mastra = new Mastra({
      agents: {
        syraa: createSyraaAgent(),
      },
    });
  }
  return mastra;
}

export function getSyraaAgent(): Agent {
  return getMastra().getAgent("syraa");
}
