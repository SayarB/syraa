import type { AnySpan } from "@mastra/core/observability";
import { RequestContext } from "@mastra/core/request-context";
import { TITLE_MODEL_CONTEXT_KEY } from "./mastra/agents/title-writer.js";
import { getTitleWriterAgent } from "./mastra/index.js";
import { getSyraaMemory } from "./mastra/memory.js";
import { getUserSettings } from "./settings.js";
import {
  openingThreadMessages,
  saveThreadTitle,
  type ThreadTextMessage,
  titleSourceOf,
  truncateThreadTitle,
} from "./threads.js";

// Reasoning models think before answering (~50–100 tokens for a title); the budget covers that.
const TITLE_MAX_OUTPUT_TOKENS = 1024;
// The turn's final event waits for the title, so a slow model must not hold it for long.
const TITLE_TIMEOUT_MS = 8_000;
/** Each message is cut to this many characters in the title prompt. */
const PROMPT_MESSAGE_CHARS = 1500;

/** Tidy model output into a title, or null when nothing usable came back. */
export function cleanGeneratedTitle(raw: string): string | null {
  const firstLine =
    raw
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "";
  const title = firstLine
    .replace(/^title\s*:\s*/i, "")
    .replace(/^[#*_`\s]+|[*_`\s]+$/g, "")
    .replace(/^["'“”‘’«]+|["'“”‘’»]+$/g, "")
    .replace(/[.!?:;,\s]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!title) return null;
  return truncateThreadTitle(title);
}

function titlePrompt(messages: ThreadTextMessage[]): string {
  return messages
    .map((message) => {
      const text =
        message.text.length > PROMPT_MESSAGE_CHARS
          ? `${message.text.slice(0, PROMPT_MESSAGE_CHARS)}…`
          : message.text;
      return `${message.role === "user" ? "User" : "Assistant"}: ${text}`;
    })
    .join("\n\n");
}

/** Ask the title model (the user's `titleModel` setting) for a title. Null on empty output. */
export async function generateThreadTitle(opts: {
  messages: ThreadTextMessage[];
  titleModel: string;
  threadId?: string;
  parentSpan?: AnySpan;
}): Promise<string | null> {
  if (!opts.messages.some((message) => message.role === "user")) return null;

  const requestContext = new RequestContext();
  requestContext.set(TITLE_MODEL_CONTEXT_KEY, opts.titleModel);

  const output = await getTitleWriterAgent().generate(titlePrompt(opts.messages), {
    requestContext,
    modelSettings: {
      temperature: 0.2,
      maxOutputTokens: TITLE_MAX_OUTPUT_TOKENS,
      headers: opts.threadId ? { "x-session-affinity": opts.threadId } : undefined,
    },
    abortSignal: AbortSignal.timeout(TITLE_TIMEOUT_MS),
    tracingContext: { currentSpan: opts.parentSpan },
  });
  return cleanGeneratedTitle(output.text ?? "");
}

/** The user's title model; the default if settings can't be read. */
async function titleModelFor(userId: string): Promise<string | undefined> {
  try {
    return (await getUserSettings(userId)).titleModel;
  } catch (error) {
    console.warn("[titles] settings not read:", error instanceof Error ? error.message : error);
    return undefined;
  }
}

/**
 * Title for a new thread from its first user message. Started alongside the reply; never rejects
 * (null means "use the fallback").
 */
export async function titleForFirstMessage(opts: {
  userId: string;
  threadId: string;
  userMessage: string;
  parentSpan?: AnySpan;
}): Promise<string | null> {
  try {
    return await generateThreadTitle({
      messages: [{ role: "user", text: opts.userMessage }],
      titleModel: (await titleModelFor(opts.userId)) ?? "chat",
      threadId: opts.threadId,
      parentSpan: opts.parentSpan,
    });
  } catch (error) {
    console.warn("[titles] title not generated:", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Name a thread after its first turn: the generated title when there is one, else the first
 * message shortened. Replaces only a missing or fallback title (a list request may have shown the
 * shortened message meanwhile), never a generated or user one. Returns the saved title.
 */
export async function nameNewThread(opts: {
  userId: string;
  threadId: string;
  userMessage: string;
  generated: Promise<string | null>;
}): Promise<string | null> {
  const generated = await opts.generated;
  const title = generated ?? truncateThreadTitle(opts.userMessage);
  const saved = await saveThreadTitle({
    userId: opts.userId,
    threadId: opts.threadId,
    title,
    source: generated ? "generated" : "fallback",
    onlyIfFallbackTitle: true,
  });
  return saved ? truncateThreadTitle(title) : null;
}

export type BackfillResult = {
  scanned: number;
  retitled: number;
  skipped: number;
  failed: number;
};

/**
 * Retitle threads whose title is a shortened first message ("fallback", including every thread
 * from before generated titles). Generated and user-set titles are left alone, so a re-run only
 * picks up threads that still need it. Uses each owner's title model setting.
 */
export async function backfillThreadTitles(
  opts: { userId?: string; dryRun?: boolean; log?: (line: string) => void } = {},
): Promise<BackfillResult> {
  const log = opts.log ?? (() => {});
  const memory = getSyraaMemory();
  const { threads } = await memory.listThreads({
    perPage: false,
    orderBy: { field: "createdAt", direction: "ASC" },
    filter: opts.userId ? { resourceId: opts.userId } : {},
  });

  const result: BackfillResult = { scanned: threads.length, retitled: 0, skipped: 0, failed: 0 };
  const titleModels = new Map<string, string>();

  for (const thread of threads) {
    if (titleSourceOf(thread.metadata) !== "fallback") {
      result.skipped++;
      continue;
    }

    try {
      const messages = await openingThreadMessages(thread.id, thread.resourceId);
      if (!messages.some((message) => message.role === "user")) {
        result.skipped++;
        continue;
      }

      let titleModel = titleModels.get(thread.resourceId);
      if (!titleModel) {
        titleModel = (await titleModelFor(thread.resourceId)) ?? "chat";
        titleModels.set(thread.resourceId, titleModel);
      }

      const title = await generateThreadTitle({ messages, titleModel, threadId: thread.id });
      if (!title) {
        result.failed++;
        log(`${thread.id}: no title from model, kept "${thread.title ?? ""}"`);
        continue;
      }

      if (!opts.dryRun) {
        const saved = await saveThreadTitle({
          userId: thread.resourceId,
          threadId: thread.id,
          title,
          source: "generated",
          onlyIfFallbackTitle: true,
        });
        if (!saved) {
          // Renamed, retitled or deleted while the model was running.
          result.skipped++;
          log(`${thread.id}: changed meanwhile, left alone`);
          continue;
        }
      }
      result.retitled++;
      log(`${thread.id}: "${thread.title ?? ""}" → "${title}"`);
    } catch (error) {
      result.failed++;
      log(`${thread.id}: failed — ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return result;
}
