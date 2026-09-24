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
      "Write ONE short sentence capturing the lasting preference, fact, rule, method, or decision the user expressed in their own message.",
      "Start with 'User'. Take facts only from the user's message.",
      "A previous assistant message is included only when the user explicitly confirmed it; use it just to resolve what 'that' or 'yes' refers to.",
      "Leave out the one-off task. If the user's message expresses nothing lasting, reply exactly NONE.",
      "No preamble, no quotes, no trailing explanation.",
    ].join(" "),
    model: () => requireChatModel().mastraModel,
  });
}
