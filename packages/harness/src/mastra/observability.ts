import { type AnySpan, type SpanOutputProcessor, SpanType } from "@mastra/core/observability";
import { LangfuseExporter } from "@mastra/langfuse";
import { Observability } from "@mastra/observability";
import { getMastra } from "./index.js";

/**
 * Langfuse tracing for the harness. Off unless LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are set
 * (LANGFUSE_BASE_URL points at the self-hosted instance). With tracing off every span below is
 * `undefined` and callers carry on untouched.
 *
 * One trace per chat turn (`chat-turn`), grouped into a Langfuse session per thread. Mastra nests
 * the agent run, each model step (with reasoning and token usage) and every tool call under it.
 */

const CHAT_TURN_TRACE = "chat-turn";

function isLangfuseConfigured(): boolean {
  return Boolean(
    process.env.LANGFUSE_PUBLIC_KEY?.trim() && process.env.LANGFUSE_SECRET_KEY?.trim(),
  );
}

export function createObservability(): Observability | undefined {
  if (!isLangfuseConfigured()) return undefined;

  const environment =
    process.env.LANGFUSE_TRACING_ENVIRONMENT?.trim() || process.env.NODE_ENV || "development";

  return new Observability({
    configs: {
      langfuse: {
        serviceName: "syraa-harness",
        exporters: [
          new LangfuseExporter({
            environment,
            release: process.env.LANGFUSE_RELEASE?.trim() || undefined,
            // Locally, flush per event so traces show up immediately; batch in production.
            realtime: environment === "development",
          }),
        ],
        // Input/output processor runs are framework noise in the trace tree.
        excludeSpanTypes: [SpanType.PROCESSOR_RUN],
        spanOutputProcessors: [new ModelCallIOProcessor()],
      },
    },
  });
}

/**
 * Each model call is a Langfuse generation, but Mastra's OTel conversion keeps only the `text` of
 * its output (dropping reasoning and tool calls) and, when streaming, leaves its input empty.
 * This fills the input from the step and rebuilds the output as one GenAI assistant message with
 * the call's reasoning, text and tool calls — so every generation shows what the model saw, what
 * it thought, and what it decided. Streamed chunk spans are folded in here and then dropped.
 */
class ModelCallIOProcessor implements SpanOutputProcessor {
  readonly name = "model-call-io";

  /** Reasoning text per model-call span, collected from its `reasoning` chunks. */
  private readonly reasoning = new WeakMap<AnySpan, string>();

  process(span?: AnySpan): AnySpan | undefined {
    if (span?.type === SpanType.MODEL_CHUNK) {
      this.collectReasoning(span);
      return undefined;
    }
    if (span?.type !== SpanType.MODEL_INFERENCE) return span;

    if (span.input === undefined) span.input = span.parent?.input;
    if (span.endTime && isStepOutput(span.output)) {
      span.output = toGenAIOutput(span.output, this.reasoning.get(span));
    }
    return span;
  }

  private collectReasoning(chunk: AnySpan): void {
    const attributes = chunk.attributes as { chunkType?: string } | undefined;
    const text = (chunk.output as { text?: unknown } | undefined)?.text;
    if (!chunk.endTime || attributes?.chunkType !== "reasoning" || typeof text !== "string") return;
    if (!chunk.parent) return;

    const soFar = this.reasoning.get(chunk.parent) ?? "";
    this.reasoning.set(chunk.parent, soFar + text);
  }

  async shutdown(): Promise<void> {}
}

type StepOutput = {
  text?: string;
  toolCalls?: { toolCallId: string; toolName: string; args?: unknown }[];
};

function isStepOutput(output: unknown): output is StepOutput {
  return typeof output === "object" && output !== null && "text" in output;
}

function toGenAIOutput(output: StepOutput, reasoning: string | undefined) {
  const parts: Record<string, unknown>[] = [];
  if (reasoning) parts.push({ type: "reasoning", content: reasoning });
  if (output.text) parts.push({ type: "text", content: output.text });
  for (const call of output.toolCalls ?? []) {
    parts.push({
      type: "tool_call",
      id: call.toolCallId,
      name: call.toolName,
      arguments: JSON.stringify(call.args ?? {}),
    });
  }
  return { messages: [{ role: "assistant", parts }] };
}

export type ChatTurnTrace = {
  userId: string;
  threadId: string;
  userMessage: string;
  /** `stream` (UI) or `generate` (JSON API). */
  mode: "stream" | "generate";
  messageId?: string;
  projectId?: string | null;
  subprojectId?: string | null;
};

/** Root span for one chat turn; `undefined` when tracing is off. */
export function startChatTurnSpan(turn: ChatTurnTrace): AnySpan | undefined {
  if (!isLangfuseConfigured()) return undefined;
  const instance = getMastra().observability.getSelectedInstance({});
  if (!instance) return undefined;

  return instance.startSpan({
    type: SpanType.GENERIC,
    name: CHAT_TURN_TRACE,
    input: turn.userMessage,
    metadata: {
      traceName: CHAT_TURN_TRACE,
      userId: turn.userId,
      sessionId: turn.threadId,
      mode: turn.mode,
      messageId: turn.messageId,
      projectId: turn.projectId ?? undefined,
      subprojectId: turn.subprojectId ?? undefined,
    },
    tracingOptions: { tags: ["chat", turn.mode] },
  });
}

/** Records the error and ends the span, unless it already ended. */
export function failSpan(span: AnySpan | undefined, error: unknown): void {
  if (!span || span.endTime) return;
  span.error({
    error: error instanceof Error ? error : new Error(String(error)),
    endSpan: true,
  });
}
