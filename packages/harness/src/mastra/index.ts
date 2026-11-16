import { Mastra } from "@mastra/core";
import type { Agent } from "@mastra/core/agent";
import { createHistorySummarizerAgent } from "./agents/history-summarizer.js";
import { createLessonWriterAgent } from "./agents/lesson-writer.js";
import { createSyraaAgent } from "./agents/syraa-agent.js";
import { createTitleWriterAgent } from "./agents/title-writer.js";
import { createObservability } from "./observability.js";
import { getMastraStorage } from "./storage.js";

type SyraaAgents = {
  syraa: Agent;
  lessonWriter: Agent;
  titleWriter: Agent;
  historySummarizer: Agent;
};

let mastra: Mastra<SyraaAgents> | null = null;

export function getMastra(): Mastra<SyraaAgents> {
  if (!mastra) {
    mastra = new Mastra({
      storage: getMastraStorage(),
      agents: {
        syraa: createSyraaAgent(),
        lessonWriter: createLessonWriterAgent(),
        titleWriter: createTitleWriterAgent(),
        historySummarizer: createHistorySummarizerAgent(),
      },
      observability: createObservability(),
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

export function getTitleWriterAgent(): Agent {
  return getMastra().getAgent("titleWriter");
}

export function getHistorySummarizerAgent(): Agent {
  return getMastra().getAgent("historySummarizer");
}

/** Flush buffered traces (batch mode) before the process exits. */
export async function shutdownObservability(): Promise<void> {
  if (!mastra) return;
  await mastra.observability.shutdown();
}

export function resetMastraForTests(): void {
  mastra = null;
}
