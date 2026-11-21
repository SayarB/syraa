import type { InputProcessor, ProcessInputArgs } from "@mastra/core/processors";
import { type Guard, type GuardVerdict, userMessageState } from "./guard.js";
import type { JevTrace } from "./jev.js";

/** Bounds Jev cost and timeout risk on very long pastes. */
const DEFAULT_MAX_CHARS = 4000;

type ProcessorMessage = ProcessInputArgs["messages"][number];

export type GuardrailContext = {
  userId: string;
  threadId: string;
  trace?: JevTrace;
};

export type GuardrailEvent = {
  guard: string;
  verdict: GuardVerdict;
  messageId: string | null;
  userId: string;
  threadId: string;
  /** The (truncated) text the guard saw. */
  text: string;
};

export type GuardrailProcessorOptions = {
  guards: Guard[];
  /** Null = no chat run context (tests, evals): do nothing. */
  resolveContext(): GuardrailContext | null;
  /** Called once per guard when its verdict is ready, possibly after the reply has finished. */
  onVerdict(event: GuardrailEvent): void | Promise<void>;
  maxChars?: number;
};

function latestUserMessage(messages: ProcessorMessage[]) {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role !== "user") continue;
    const parts = (message.content as { parts?: { type: string; text?: string }[] }).parts ?? [];
    const text = parts
      .map((part) => (part.type === "text" ? (part.text ?? "") : ""))
      .join("\n")
      .trim();
    if (text) return { id: message.id ?? null, text };
  }
  return null;
}

/**
 * Starts the guards on the new user message and never waits for them. Mastra awaits its
 * output-side hooks before the stream completes, so using one would delay the reply by the Jev
 * call; instead each verdict is written from a detached promise. A guard problem must never
 * reach the chat path.
 */
export function createGuardrailProcessor(opts: GuardrailProcessorOptions): InputProcessor {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;

  return {
    id: "guardrails",
    processInput({ messages, state }: ProcessInputArgs) {
      try {
        start(messages, state);
      } catch (error) {
        console.warn("[guardrails] skipped:", error instanceof Error ? error.message : error);
      }
      return messages;
    },
  };

  function start(messages: ProcessorMessage[], state: Record<string, unknown>): void {
    // Per-run state: a repeated input pass must not classify the same message twice.
    if (state.started) return;

    const active = opts.guards.filter((guard) => guard.enabled);
    if (active.length === 0) return;

    const context = opts.resolveContext();
    const latest = latestUserMessage(messages);
    if (!context || !latest) return;

    state.started = true;
    const text = latest.text.slice(0, maxChars);
    for (const guard of active) {
      void runGuard(guard, text, latest.id, context, opts);
    }
  }
}

async function runGuard(
  guard: Guard,
  text: string,
  messageId: string | null,
  context: GuardrailContext,
  opts: GuardrailProcessorOptions,
): Promise<void> {
  try {
    const verdict = await guard.run(userMessageState(text), context.trace);
    if (!verdict) return;
    await opts.onVerdict({
      guard: guard.name,
      verdict,
      messageId,
      userId: context.userId,
      threadId: context.threadId,
      text,
    });
  } catch (error) {
    // Never log message text: only the error.
    console.warn("[guardrails] dropped:", error instanceof Error ? error.message : error);
  }
}
