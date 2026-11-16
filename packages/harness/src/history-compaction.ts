import { RequestContext } from "@mastra/core/request-context";
import {
  applyChunk,
  applyMerge,
  buildChunkPrompt,
  buildMergePrompt,
  type CompactionConfig,
  type CompactionState,
  emptyCompactionState,
  MERGE_SUMMARY_INSTRUCTIONS,
  nextJob,
  parseChunkSummary,
  parseMergedNote,
  positionsById,
  type RecalledMessage,
  resolveCompactionConfig,
  splitTurns,
  summaryTargets,
} from "@syraa/history";
import { type CompactionStateStore, getCompactionStateStore } from "./history-state.js";
import { HISTORY_SUMMARY_MODEL_CONTEXT_KEY } from "./mastra/agents/history-summarizer.js";
import { getHistorySummarizerAgent } from "./mastra/index.js";
import { resolveChatModel } from "./mastra/model.js";
import { usableModelRef } from "./model-options.js";
import { effectiveModelRef, getUserSettings, SAME_AS_CHAT_MODEL } from "./settings.js";
import { loadThreadTextMessages } from "./threads.js";

/** The two model calls a compaction job makes. Tests pass fakes. */
export type HistorySummarizer = {
  summarizeChunk(prompt: string): Promise<string>;
  mergeNote(prompt: string): Promise<string>;
};

const SUMMARY_TIMEOUT_MS = 90_000;
// Reasoning models spend output tokens thinking before they answer.
const SUMMARY_MAX_OUTPUT_TOKENS = 2048;

/** The summariser, calling `model` (a slug on the chat provider) or the chat model when it is omitted. */
export function agentSummarizer(model?: string): HistorySummarizer {
  const run = async (prompt: string, instructions?: string) => {
    const requestContext = new RequestContext();
    requestContext.set(HISTORY_SUMMARY_MODEL_CONTEXT_KEY, model ?? SAME_AS_CHAT_MODEL);
    const output = await getHistorySummarizerAgent().generate(prompt, {
      requestContext,
      ...(instructions ? { instructions } : {}),
      modelSettings: { temperature: 0, maxOutputTokens: SUMMARY_MAX_OUTPUT_TOKENS },
      abortSignal: AbortSignal.timeout(SUMMARY_TIMEOUT_MS),
    });
    return output.text ?? "";
  };
  return {
    summarizeChunk: (prompt) => run(prompt),
    mergeNote: (prompt) => run(prompt, MERGE_SUMMARY_INSTRUCTIONS),
  };
}

export type CompactionRunOptions = {
  userId: string;
  threadId: string;
  summarizer?: HistorySummarizer;
  /** Model slug for the default summariser (the user's setting). Ignored when `summarizer` is given. */
  model?: string;
  store?: CompactionStateStore;
  loadMessages?: (opts: { userId: string; threadId: string }) => Promise<RecalledMessage[]>;
  config?: CompactionConfig;
  /** Most model calls in one run. A long, uncompacted thread catches up over several turns. */
  maxJobs?: number;
};

const DEFAULT_MAX_JOBS = 3;

/**
 * Brings a thread's summaries up to date: summarises each newly aged chunk from its raw messages,
 * and folds chunks that have aged out into the epoch note. Each step is saved on its own, with
 * the revision it started from, so a crash or a racing run never leaves half-written state.
 */
export async function compactThreadHistory(
  opts: CompactionRunOptions,
): Promise<{ jobs: number; state: CompactionState }> {
  const config = opts.config ?? resolveCompactionConfig();
  const store = opts.store ?? getCompactionStateStore();
  const summarizer = opts.summarizer ?? agentSummarizer(opts.model);
  const maxJobs = opts.maxJobs ?? DEFAULT_MAX_JOBS;

  const messages = await (opts.loadMessages ?? loadThreadTextMessages)({
    userId: opts.userId,
    threadId: opts.threadId,
  });
  const turns = splitTurns(messages);
  const positions = positionsById(messages);
  const targets = summaryTargets(config);

  let state = (await store.load(opts.userId, opts.threadId)) ?? emptyCompactionState();
  let jobs = 0;

  while (jobs < maxJobs) {
    const job = nextJob(turns.length, state, config);
    if (!job) break;

    let next: CompactionState;
    if (job.kind === "chunk") {
      const slice = turns.slice(job.fromTurn, job.toTurn + 1);
      const first = slice[0].messages[0];
      const last = slice[slice.length - 1].messages.at(-1) ?? first;
      const parsed = parseChunkSummary(
        await summarizer.summarizeChunk(buildChunkPrompt(slice, targets)),
        targets,
      );
      next = applyChunk(state, {
        index: job.index,
        fromTurn: job.fromTurn,
        toTurn: job.toTurn,
        fromPos: positions.get(first.id) ?? 0,
        toPos: positions.get(last.id) ?? 0,
        fromId: first.id,
        toId: last.id,
        ...parsed,
      });
    } else {
      const oldest = state.chunks.find((chunk) => chunk.index === job.index);
      if (!oldest) break;
      const note = parseMergedNote(
        await summarizer.mergeNote(
          buildMergePrompt(state.epoch?.text ?? null, oldest.short, targets.epochTokens),
        ),
        targets.epochTokens,
      );
      next = applyMerge(state, note);
    }

    const saved = await store.save(opts.userId, opts.threadId, next, state.rev);
    if (!saved) break; // another run got there first, or the thread is gone
    state = next;
    jobs++;
  }

  return { jobs, state };
}

const inFlight = new Map<string, Promise<void>>();
const lastFailure = new Map<string, number>();
/** After a failed run, leave the thread alone for a while instead of retrying (and paying) every turn. */
const RETRY_AFTER_FAILURE_MS = 5 * 60_000;

/** One compaction run for the user, using their settings. Does nothing if they turned compaction off. */
export async function compactIfEnabled(
  opts: { userId: string; threadId: string },
  deps: {
    getSettings?: typeof getUserSettings;
    resolveModel?: typeof usableModelRef;
    compact?: typeof compactThreadHistory;
  } = {},
): Promise<{ ran: boolean; model?: string }> {
  const settings = await (deps.getSettings ?? getUserSettings)(opts.userId);
  if (!settings.historyCompaction) return { ran: false };
  // "Same as chat model" follows the chat model the user chose; a model that has left the list is
  // replaced by the default.
  const model = await (deps.resolveModel ?? usableModelRef)(
    effectiveModelRef(settings.historySummaryModel, settings),
  );
  await (deps.compact ?? compactThreadHistory)({ ...opts, model });
  return { ran: true, model };
}

/**
 * Starts a compaction run in the background and returns at once, so it never delays a reply. Does
 * nothing for a user who turned compaction off. At most one run per thread at a time; failures are
 * logged, and the fallback trim keeps prompts bounded meanwhile.
 */
export function scheduleHistoryCompaction(opts: { userId: string; threadId: string }): void {
  if (!resolveChatModel()) return;
  if (inFlight.has(opts.threadId)) return;
  const failedAt = lastFailure.get(opts.threadId);
  if (failedAt !== undefined && Date.now() - failedAt < RETRY_AFTER_FAILURE_MS) return;

  const run = compactIfEnabled(opts)
    .then(() => {
      lastFailure.delete(opts.threadId);
    })
    .catch((error) => {
      lastFailure.set(opts.threadId, Date.now());
      console.warn("[history] compaction failed:", error instanceof Error ? error.message : error);
    })
    .finally(() => {
      inFlight.delete(opts.threadId);
    });
  inFlight.set(opts.threadId, run);
}

/** Waits (up to `timeoutMs`) for running compactions, so a shutdown doesn't cut one off mid-save. */
export async function drainHistoryCompaction(timeoutMs = 10_000): Promise<void> {
  if (inFlight.size === 0) return;
  await Promise.race([
    Promise.allSettled([...inFlight.values()]),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}
