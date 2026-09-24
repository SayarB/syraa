import { Mastra } from "@mastra/core";
import type { Agent } from "@mastra/core/agent";
import { createLessonWriterAgent } from "./agents/lesson-writer.js";
import { createSyraaAgent } from "./agents/syraa-agent.js";
import { getMastraStorage } from "./storage.js";

type SyraaAgents = { syraa: Agent; lessonWriter: Agent };

let mastra: Mastra<SyraaAgents> | null = null;

export function getMastra(): Mastra<SyraaAgents> {
  if (!mastra) {
    mastra = new Mastra({
      storage: getMastraStorage(),
      agents: {
        syraa: createSyraaAgent(),
        lessonWriter: createLessonWriterAgent(),
      },
    });
  }
  return mastra;
}

export function getSyraaAgent(): Agent {
  return getMastra().getAgent("syraa");
}

export function getLessonWriterAgent(): Agent {
  return getMastra().getAgent("lessonWriter");
}

export function resetMastraForTests(): void {
  mastra = null;
}
