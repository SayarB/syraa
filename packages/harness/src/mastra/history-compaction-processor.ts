import type { MastraDBMessage } from "@mastra/core/agent";
import type { ProcessInputArgs, Processor } from "@mastra/core/processors";
import {
  type CompactionConfig,
  type CompactionState,
  clipText,
  type FallbackTurn,
  fallbackActions,
  lastCoveredMessageId,
  renderSummaryBlock,
  resolveCompactionConfig,
} from "@syraa/history";
import { tryGetChatRunContext } from "../chat-run-context.js";
import { getCompactionStateStore, isHistoryCompactionEnabled } from "../history-state.js";
import { wrapUntrusted } from "../untrusted.js";

/** Longest text kept from a message in an older turn when the fallback has to shorten it. */
const FALLBACK_TEXT_CHARS = 600;
const OLD_TOOL_RESULT = "[older tool result left out; call the tool again if you need it]";
const SUMMARY_SOURCE = "earlier turns of this conversation (automatic summaries)";

type Part = { type: string; [key: string]: unknown };

const partsOf = (message: MastraDBMessage): Part[] => (message.content?.parts ?? []) as Part[];
const isToolPart = (part: Part) =>
  part.type === "tool-invocation" || part.type === "dynamic-tool" || part.type.startsWith("tool-");

function jsonLength(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

/** Characters a part adds to the prompt. Images, files and reasoning are not counted. */
function partChars(part: Part): number {
  if (part.type === "text") return typeof part.text === "string" ? part.text.length : 0;
  return isToolPart(part) ? jsonLength(part) : 0;
}

function clippedPartChars(part: Part): number {
  if (part.type === "text") return Math.min(partChars(part), FALLBACK_TEXT_CHARS);
  return isToolPart(part) ? Math.min(jsonLength(part), OLD_TOOL_RESULT.length + 120) : 0;
}

/** Shortens a message in place for this request: long text is cut and tool results are dropped. */
function clipMessage(message: MastraDBMessage): void {
  for (const part of partsOf(message)) {
    if (part.type === "text" && typeof part.text === "string") {
      part.text = clipText(part.text, FALLBACK_TEXT_CHARS);
    } else if (part.type === "tool-invocation" && typeof part.toolInvocation === "object") {
      const invocation = part.toolInvocation as Record<string, unknown>;
      if ("result" in invocation) invocation.result = OLD_TOOL_RESULT;
    } else if (isToolPart(part) && "output" in part) {
      part.output = OLD_TOOL_RESULT;
    }
  }
}

function groupIntoTurns(messages: readonly MastraDBMessage[]): MastraDBMessage[][] {
  const turns: MastraDBMessage[][] = [];
  for (const message of messages) {
    const current = turns.at(-1);
    if (message.role === "user" || !current) turns.push([message]);
    else current.push(message);
  }
  return turns;
}

/** Same rough rate as `estimateTokens` (four characters per token), plus a few tokens of message overhead. */
const tokensOf = (chars: number) => Math.ceil(chars / 4) + 4;

function turnSize(turn: readonly MastraDBMessage[]): FallbackTurn {
  let full = 0;
  let clipped = 0;
  for (const message of turn) {
    for (const part of partsOf(message)) {
      full += partChars(part);
      clipped += clippedPartChars(part);
    }
  }
  return { tokens: tokensOf(full), clippedTokens: tokensOf(clipped) };
}

export type HistoryCompactionOptions = {
  config?: CompactionConfig;
  enabled?: () => boolean;
  loadState?: (userId: string, threadId: string) => Promise<CompactionState | null>;
};

/**
 * Sends the model a compact version of the thread: the newest turns exactly as written, older turns
 * as summaries (see @syraa/history). Summaries are written in the background after each turn; this
 * only reads them, so it never calls a model and never delays a reply.
 *
 * It changes only the history sent for this request. Nothing is deleted from storage, and the
 * summarised messages stay searchable through thread_history.
 *
 * Outside a chat run (evals, tests) it does nothing.
 */
export class HistoryCompactionProcessor implements Processor {
  readonly id = "history-compaction";

  private readonly config: CompactionConfig;
  private readonly enabled: () => boolean;
  private readonly loadState: NonNullable<HistoryCompactionOptions["loadState"]>;

  constructor(options: HistoryCompactionOptions = {}) {
    this.config = options.config ?? resolveCompactionConfig();
    this.enabled = options.enabled ?? isHistoryCompactionEnabled;
    this.loadState =
      options.loadState ?? ((userId, threadId) => getCompactionStateStore().load(userId, threadId));
  }

  async processInput({ messages, messageList }: ProcessInputArgs) {
    const ctx = tryGetChatRunContext();
    if (!ctx || !this.enabled()) return messages;

    // Everything from the newest user message on is this turn's and is never touched.
    let current = -1;
    messages.forEach((message, index) => {
      if (message.role === "user") current = index;
    });
    if (current <= 0) return messages;
    const history = messages.slice(0, current);

    const state = await this.safeLoadState(ctx.userId, ctx.threadId);
    const dropped = new Set<string>();

    let unsummarised = history;
    const covered = state ? lastCoveredMessageId(state) : null;
    const coveredAt = covered ? history.findIndex((message) => message.id === covered) : -1;
    if (coveredAt >= 0) {
      for (const message of history.slice(0, coveredAt + 1)) dropped.add(message.id);
      unsummarised = history.slice(coveredAt + 1);
    }

    // Safety net for turns with no summary yet (job behind or failed, or an old thread).
    const turns = groupIntoTurns(unsummarised);
    const actions = fallbackActions(turns.map(turnSize), this.config);
    turns.forEach((turn, index) => {
      if (actions[index] === "drop") for (const message of turn) dropped.add(message.id);
      else if (actions[index] === "clip") for (const message of turn) clipMessage(message);
    });

    const block = state ? renderSummaryBlock(state, this.config) : null;
    if (block) messageList.addSystem(wrapUntrusted(SUMMARY_SOURCE, block), "history-compaction");

    return dropped.size > 0 ? messages.filter((message) => !dropped.has(message.id)) : messages;
  }

  private async safeLoadState(userId: string, threadId: string): Promise<CompactionState | null> {
    try {
      return await this.loadState(userId, threadId);
    } catch (error) {
      console.warn(
        "[history] summaries unavailable:",
        error instanceof Error ? error.message : error,
      );
      return null;
    }
  }
}
