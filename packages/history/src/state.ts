/** Thread metadata key holding the compaction state. */
export const COMPACTION_METADATA_KEY = "historyCompaction";

/** Summaries of one chunk of consecutive turns. Both are written from the raw messages, once. */
export type ChunkSummary = {
  /** Increases by one per chunk, for the life of the thread. */
  index: number;
  /** Turn numbers covered, inclusive. */
  fromTurn: number;
  toTurn: number;
  /** 1-based message positions covered, inclusive. */
  fromPos: number;
  toPos: number;
  /** First and last message ids covered. */
  fromId: string;
  toId: string;
  /** Fuller summary, shown while the chunk is fairly recent. */
  detail: string;
  /** Shorter summary, shown once the chunk is older. */
  short: string;
};

/** One note standing in for every chunk that has aged out of the tiers. */
export type EpochSummary = {
  text: string;
  /** Turns `[0, throughTurn]` are covered. */
  throughTurn: number;
  throughPos: number;
  throughId: string;
};

export type CompactionState = {
  version: 1;
  /** Bumped on every change; a writer must present the revision it read, so racing writers can't clobber each other. */
  rev: number;
  /** Turns `[0, summarizedTurns)` are covered by the epoch note and the chunks. */
  summarizedTurns: number;
  nextChunkIndex: number;
  epoch: EpochSummary | null;
  /** Chunks not yet folded into the epoch note, oldest first. */
  chunks: ChunkSummary[];
  updatedAt: string;
};

export function emptyCompactionState(now = new Date()): CompactionState {
  return {
    version: 1,
    rev: 0,
    summarizedTurns: 0,
    nextChunkIndex: 0,
    epoch: null,
    chunks: [],
    updatedAt: now.toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isInt = (value: unknown): value is number => Number.isInteger(value);
const isText = (value: unknown): value is string => typeof value === "string";

function parseChunk(value: unknown): ChunkSummary | null {
  if (!isRecord(value)) return null;
  const { index, fromTurn, toTurn, fromPos, toPos, fromId, toId, detail, short } = value;
  if (![index, fromTurn, toTurn, fromPos, toPos].every(isInt)) return null;
  if (![fromId, toId, detail, short].every(isText)) return null;
  return value as ChunkSummary;
}

/** Reads stored state. Anything malformed or from another version is ignored (null), never trusted. */
export function parseCompactionState(value: unknown): CompactionState | null {
  if (!isRecord(value) || value.version !== 1) return null;
  if (![value.rev, value.summarizedTurns, value.nextChunkIndex].every(isInt)) return null;
  if (!Array.isArray(value.chunks)) return null;

  const chunks: ChunkSummary[] = [];
  for (const raw of value.chunks) {
    const chunk = parseChunk(raw);
    if (!chunk) return null;
    chunks.push(chunk);
  }

  let epoch: EpochSummary | null = null;
  if (value.epoch !== null && value.epoch !== undefined) {
    const raw = value.epoch;
    if (!isRecord(raw) || !isText(raw.text) || !isText(raw.throughId)) return null;
    if (!isInt(raw.throughTurn) || !isInt(raw.throughPos)) return null;
    epoch = raw as EpochSummary;
  }

  return {
    version: 1,
    rev: value.rev as number,
    summarizedTurns: value.summarizedTurns as number,
    nextChunkIndex: value.nextChunkIndex as number,
    epoch,
    chunks,
    updatedAt: isText(value.updatedAt) ? value.updatedAt : new Date(0).toISOString(),
  };
}

/** Id of the last message the summaries cover, or null when nothing is summarised yet. */
export function lastCoveredMessageId(state: CompactionState): string | null {
  return state.chunks.at(-1)?.toId ?? state.epoch?.throughId ?? null;
}
