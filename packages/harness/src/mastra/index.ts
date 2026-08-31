import { Mastra } from "@mastra/core";
import type { Agent } from "@mastra/core/agent";
import { createSyraaAgent } from "./agents/syraa-agent.js";
import { getMastraStorage } from "./storage.js";

let mastra: Mastra<{ syraa: Agent }> | null = null;

export function getMastra(): Mastra<{ syraa: Agent }> {
  if (!mastra) {
    mastra = new Mastra({
      storage: getMastraStorage(),
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

export function resetMastraForTests(): void {
  mastra = null;
}
