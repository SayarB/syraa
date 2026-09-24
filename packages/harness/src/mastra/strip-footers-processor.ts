import type { ProcessOutputResultArgs, Processor } from "@mastra/core/processors";
import { stripRuntimeFooters } from "./resolve-turn.js";

/**
 * Strips runtime footers from assistant text before Mastra Memory saves it, so thread history,
 * the next turn's model context and the lesson gate's previous-reply state never see them.
 */
export class StripFootersProcessor implements Processor {
  readonly id = "strip-runtime-footers";

  processOutputResult({ messages }: ProcessOutputResultArgs) {
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      for (const part of message.content.parts ?? []) {
        if (part.type !== "text") continue;
        const stripped = stripRuntimeFooters(part.text);
        if (stripped !== part.text.trim()) part.text = stripped;
      }
      if (typeof message.content.content === "string") {
        const stripped = stripRuntimeFooters(message.content.content);
        if (stripped !== message.content.content.trim()) message.content.content = stripped;
      }
    }
    return messages;
  }
}
