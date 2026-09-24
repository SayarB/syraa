import type { ProcessInputArgs, ProcessOutputResultArgs, Processor } from "@mastra/core/processors";

type ProcessorMessage = ProcessInputArgs["messages"][number];

/** Drops reasoning (the model's hidden thinking) from an assistant message, in place. */
export function stripReasoning(message: ProcessorMessage): void {
  if (message.role !== "assistant") return;
  const content = message.content as { parts?: { type: string }[]; reasoning?: unknown };
  if (content.parts) content.parts = content.parts.filter((part) => part.type !== "reasoning");
  if ("reasoning" in content) delete content.reasoning;
}

function hasParts(message: ProcessorMessage): boolean {
  const parts = (message.content as { parts?: unknown[] }).parts;
  return parts === undefined || parts.length > 0;
}

/**
 * Keeps model reasoning out of thread history. Reasoning traces run to thousands of characters
 * and restate rules from memory at the time — replaying them lets removed preferences resurface.
 * - processInput: strips it from history loaded for this turn (covers messages saved earlier).
 * - processOutputResult: strips it from the new reply before Mastra Memory saves it.
 */
export class StripReasoningProcessor implements Processor {
  readonly id = "strip-reasoning";

  processInput({ messages }: ProcessInputArgs) {
    for (const message of messages) stripReasoning(message);
    return messages.filter(hasParts);
  }

  processOutputResult({ messages }: ProcessOutputResultArgs) {
    for (const message of messages) stripReasoning(message);
    return messages;
  }
}
