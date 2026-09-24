import { Agent } from "@mastra/core/agent";
import { requireChatModel } from "../model.js";

export const LESSON_WRITER_AGENT_ID = "lesson-writer";

/** Writes one memory sentence when the user's own words don't stand alone ("yes please", complaints). */
export function createLessonWriterAgent(): Agent {
  return new Agent({
    id: LESSON_WRITER_AGENT_ID,
    name: "Lesson Writer",
    description:
      "Phrases a durable user preference, fact, rule, method, or decision as one memory sentence.",
    instructions: [
      "Write ONE short sentence capturing the lasting preference, fact, rule, method, or decision the user expressed.",
      "Start with 'User'. Use the previous assistant message only to resolve what 'that' or 'yes' refers to.",
      "Leave out the one-off task. No preamble, no quotes, no trailing explanation.",
    ].join(" "),
    model: () => requireChatModel().mastraModel,
  });
}
