import { Mastra } from "@mastra/core";
import type { Agent } from "@mastra/core/agent";
import { createEverydayAgent } from "./agents/everyday-agent.js";

let mastra: Mastra<{ everyday: Agent }> | null = null;

export function getMastra(): Mastra<{ everyday: Agent }> {
  if (!mastra) {
    mastra = new Mastra({
      agents: {
        everyday: createEverydayAgent(),
      },
    });
  }
  return mastra;
}

export function getEverydayAgent(): Agent {
  return getMastra().getAgent("everyday");
}
