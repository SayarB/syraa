import { createTool } from "@mastra/core/tools";
import {
  DEFAULT_SEARCH_LIMIT,
  getMessageWindow,
  MAX_WINDOW_AROUND,
  type MessageHit,
  type RecalledMessage,
  searchMessages,
} from "@syraa/history";
import { z } from "zod";
import { type ChatRunContext, getChatRunContext } from "../../chat-run-context.js";
import { loadThreadTextMessages } from "../../threads.js";
import { rememberToolResult, repeatedToolResult } from "../../tool-call-dedupe.js";
import { jsonWithUntrusted, textForModel } from "../../untrusted.js";

export const MAX_THREAD_HISTORY_CALLS_PER_TURN = 4;
/** Most characters of message text returned in one call (about 2.5k tokens). Search hits are already capped below this; it bounds a fetched message with its neighbours. */
const MAX_OUTPUT_CHARS = 9000;

const inputSchema = z.object({
  query: z.string().min(1).max(200).optional(),
  role: z.enum(["user", "assistant"]).optional(),
  order: z.enum(["oldest", "newest"]).optional(),
  limit: z.number().int().min(1).max(DEFAULT_SEARCH_LIMIT).optional(),
  messageId: z.string().min(1).optional(),
  around: z.number().int().min(0).max(MAX_WINDOW_AROUND).optional(),
});

export type ThreadHistoryOutput = {
  totalMessages: number;
  matched?: number;
  messages: MessageHit[];
  note?: string;
  error?: string;
};

export type ThreadHistoryInput = z.infer<typeof inputSchema>;

/** Counts a call against this turn's budget; false once the cap is reached. */
function takeTurnSlot(ctx: ChatRunContext): boolean {
  ctx.threadHistoryCount = (ctx.threadHistoryCount ?? 0) + 1;
  return ctx.threadHistoryCount <= MAX_THREAD_HISTORY_CALLS_PER_TURN;
}

/**
 * The question being answered now is already saved in the thread; it would otherwise be the
 * newest "user" hit. Leave out only the newest user message, and only if it is this turn's.
 */
function currentQuestion(
  messages: readonly RecalledMessage[],
  currentUserMessage: string | undefined,
): ((message: RecalledMessage) => boolean) | undefined {
  const current = currentUserMessage?.trim();
  if (!current) return undefined;
  let newestUser: RecalledMessage | undefined;
  for (const message of messages) if (message.role === "user") newestUser = message;
  if (!newestUser || newestUser.text.trim() !== current) return undefined;
  const newestId = newestUser.id;
  return (message) => message.id === newestId;
}

/** The tool's logic, apart from loading messages, so it can be tested on its own. */
export function runThreadHistory(
  messages: readonly RecalledMessage[],
  input: ThreadHistoryInput,
  currentUserMessage?: string,
): ThreadHistoryOutput {
  const totalMessages = messages.length;

  if (input.messageId) {
    // Full text of one message, plus neighbours as far as they fit in the output budget.
    for (let around = input.around ?? 0; ; around--) {
      const window = getMessageWindow(messages, input.messageId, around);
      if (!window) {
        return {
          totalMessages,
          messages: [],
          error: "No message with that id in this conversation. Search first to get an id.",
        };
      }
      const size = window.reduce((sum, hit) => sum + hit.text.length, 0);
      if (size <= MAX_OUTPUT_CHARS || around <= 0) {
        const shrunk = around < (input.around ?? 0);
        return {
          totalMessages,
          messages: window,
          ...(shrunk
            ? { note: "Some neighbouring messages were left out to keep the result short." }
            : {}),
        };
      }
    }
  }

  const { hits, matched } = searchMessages(messages, {
    query: input.query,
    role: input.role,
    order: input.order,
    limit: input.limit,
    exclude: currentQuestion(messages, currentUserMessage),
  });

  const note =
    hits.length === 0
      ? input.query
        ? `No message in this conversation matches "${input.query}".`
        : "There are no earlier messages that match."
      : matched > hits.length
        ? "More messages match. Narrow the query, or fetch one by messageId for its full text."
        : undefined;

  return { totalMessages, matched, messages: hits, ...(note ? { note } : {}) };
}

export const threadHistoryTool = createTool({
  id: "thread_history",
  description:
    "Look up earlier messages in THIS conversation that are no longer shown in full: older turns that appear only as a summary, or the user's first or last message. Search by words (query), list by date (order oldest or newest, optionally role), or fetch one message by id with the messages around it (messageId, around). Use it when the user asks what they or you said earlier, or when exact wording matters. Do not use it for anything already visible in the conversation.",
  inputSchema,
  mcp: {
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
  },
  toModelOutput: (output) =>
    textForModel(
      jsonWithUntrusted(
        "earlier messages in this conversation",
        output as Record<string, unknown>,
        ["messages"],
      ),
    ),
  execute: async (input) => {
    const repeat = repeatedToolResult("thread_history", input);
    if (repeat) return repeat;

    const ctx = getChatRunContext();
    if (!takeTurnSlot(ctx)) {
      return {
        totalMessages: 0,
        messages: [],
        error: "Look-up limit for this turn reached. Answer from what you already have.",
      };
    }

    const messages = await loadThreadTextMessages({ userId: ctx.userId, threadId: ctx.threadId });
    const result = runThreadHistory(messages, input, ctx.currentUserMessage);
    rememberToolResult("thread_history", input, result);
    return result;
  },
});
