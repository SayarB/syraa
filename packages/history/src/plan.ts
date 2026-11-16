import { type CompactionConfig, tierChunks } from "./config.js";
import type { ChunkSummary, CompactionState } from "./state.js";

/**
 * How many of the oldest turns are summarised, out of `turnCount` turns so far.
 *
 * It steps up only every `chunkTurns` turns. Between steps the summarised prefix of the prompt
 * does not change at all, so the provider's prompt cache keeps hitting; only the recent, verbatim
 * tail grows.
 */
export function boundaryTurns(turnCount: number, config: CompactionConfig): number {
  const aged = turnCount - config.recentTurns;
  if (aged < config.chunkTurns) return 0;
  return Math.floor(aged / config.chunkTurns) * config.chunkTurns;
}

export type SummaryLevel = "detail" | "short";

/** Which summary a chunk shows, by its age in chunks (0 = the newest chunk). `epoch` = fold it into the oldest note. */
export function chunkLevel(ageInChunks: number, config: CompactionConfig): SummaryLevel | "epoch" {
  const tiers = tierChunks(config);
  if (ageInChunks < tiers.detail) return "detail";
  if (ageInChunks < tiers.detail + tiers.short) return "short";
  return "epoch";
}

export type CompactionJob =
  /** Summarise turns `fromTurn..toTurn` (inclusive) from their raw messages. */
  | { kind: "chunk"; index: number; fromTurn: number; toTurn: number }
  /** Fold the oldest chunk's short summary into the epoch note. */
  | { kind: "merge"; index: number };

/** The next piece of work, or null when the summaries are up to date. Run it, apply the result, ask again. */
export function nextJob(
  turnCount: number,
  state: CompactionState,
  config: CompactionConfig,
): CompactionJob | null {
  const boundary = boundaryTurns(turnCount, config);
  if (state.summarizedTurns + config.chunkTurns <= boundary) {
    return {
      kind: "chunk",
      index: state.nextChunkIndex,
      fromTurn: state.summarizedTurns,
      toTurn: state.summarizedTurns + config.chunkTurns - 1,
    };
  }

  const oldest = state.chunks[0];
  const newest = state.chunks.at(-1);
  if (oldest && newest && chunkLevel(newest.index - oldest.index, config) === "epoch") {
    return { kind: "merge", index: oldest.index };
  }
  return null;
}

/** State after adding a finished chunk. Throws if the chunk isn't the next one in line. */
export function applyChunk(
  state: CompactionState,
  chunk: ChunkSummary,
  now = new Date(),
): CompactionState {
  if (chunk.index !== state.nextChunkIndex || chunk.fromTurn !== state.summarizedTurns) {
    throw new Error("chunk does not continue the summarised history");
  }
  return {
    ...state,
    rev: state.rev + 1,
    summarizedTurns: chunk.toTurn + 1,
    nextChunkIndex: chunk.index + 1,
    chunks: [...state.chunks, chunk],
    updatedAt: now.toISOString(),
  };
}

/** State after folding the oldest chunk into the epoch note, whose new text is `epochText`. */
export function applyMerge(
  state: CompactionState,
  epochText: string,
  now = new Date(),
): CompactionState {
  const [oldest, ...rest] = state.chunks;
  if (!oldest) throw new Error("no chunk to merge");
  return {
    ...state,
    rev: state.rev + 1,
    epoch: {
      text: epochText,
      throughTurn: oldest.toTurn,
      throughPos: oldest.toPos,
      throughId: oldest.toId,
    },
    chunks: rest,
    updatedAt: now.toISOString(),
  };
}

/** Size of one turn as sent in full, and as sent with its long text shortened. */
export type FallbackTurn = { tokens: number; clippedTokens: number };
export type FallbackAction = "keep" | "clip" | "drop";

/**
 * Safety net for turns that have not been summarised (the summary job is behind, failed, or the
 * thread predates compaction): keeps their total under `budgets.verbatim` without a model call.
 * The newest `recentTurns` turns are never touched. Older ones are shortened oldest-first, then,
 * if that is not enough, dropped oldest-first.
 */
export function fallbackActions(
  turns: readonly FallbackTurn[],
  config: CompactionConfig,
): FallbackAction[] {
  const actions: FallbackAction[] = turns.map(() => "keep");
  let total = turns.reduce((sum, turn) => sum + turn.tokens, 0);
  const budget = config.budgets.verbatim;
  if (total <= budget) return actions;

  const unprotected = Math.max(0, turns.length - config.recentTurns);

  for (let i = 0; i < unprotected && total > budget; i++) {
    actions[i] = "clip";
    total -= turns[i].tokens - Math.min(turns[i].tokens, turns[i].clippedTokens);
  }
  for (let i = 0; i < unprotected && total > budget; i++) {
    total -=
      actions[i] === "clip" ? Math.min(turns[i].tokens, turns[i].clippedTokens) : turns[i].tokens;
    actions[i] = "drop";
  }
  return actions;
}
