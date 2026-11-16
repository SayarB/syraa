/**
 * Compaction settings.
 *
 * History is split into whole turns (one user message and the replies to it). The newest turns are
 * sent exactly as written; older ones are replaced by summaries that get shorter with age:
 *
 *   newest ─► verbatim ─► detail ─► short ─► epoch note ◄─ oldest
 *
 * A tier `j` covers about `recentTurns × growth^j` turns, so tiers grow geometrically and the
 * prompt stays roughly the same size however long the thread gets.
 */
export type CompactionBudgets = {
  /** Tokens for every "detail" summary together. */
  detail: number;
  /** Tokens for every "short" summary together. */
  short: number;
  /** Tokens for the single note holding everything older. */
  epoch: number;
  /** Most tokens the not-yet-summarised recent turns may use before the fallback trims them. */
  verbatim: number;
};

export type CompactionConfig = {
  /** `n`: turns that are always sent exactly as written. */
  recentTurns: number;
  /** `k`: turns per chunk. Tiers are rebuilt only every `k` turns, which keeps the prompt prefix stable. */
  chunkTurns: number;
  /** `g`: how much wider each older tier is than the one before. */
  growth: number;
  budgets: CompactionBudgets;
};

export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
  recentTurns: 3,
  chunkTurns: 4,
  growth: 2,
  budgets: { detail: 1500, short: 1000, epoch: 500, verbatim: 8000 },
};

export type CompactionOverrides = Partial<Omit<CompactionConfig, "budgets">> & {
  budgets?: Partial<CompactionBudgets>;
};

function positiveInt(name: string, value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a whole number of at least 1 (got ${value})`);
  }
  return value;
}

/** Defaults with `overrides` applied. Throws on a value that would break the algorithm. */
export function resolveCompactionConfig(overrides: CompactionOverrides = {}): CompactionConfig {
  const base = DEFAULT_COMPACTION_CONFIG;
  const budgets = { ...base.budgets, ...overrides.budgets };
  const growth = overrides.growth ?? base.growth;
  if (!Number.isFinite(growth) || growth < 1) {
    throw new RangeError(`growth must be at least 1 (got ${growth})`);
  }
  return {
    recentTurns: positiveInt("recentTurns", overrides.recentTurns ?? base.recentTurns),
    chunkTurns: positiveInt("chunkTurns", overrides.chunkTurns ?? base.chunkTurns),
    growth,
    budgets: {
      detail: positiveInt("budgets.detail", budgets.detail),
      short: positiveInt("budgets.short", budgets.short),
      epoch: positiveInt("budgets.epoch", budgets.epoch),
      verbatim: positiveInt("budgets.verbatim", budgets.verbatim),
    },
  };
}

/** Chunks per summary tier: tier `j` spans `recentTurns × growth^j` turns. */
export function tierChunks(config: CompactionConfig): { detail: number; short: number } {
  const chunks = (power: number) =>
    Math.max(1, Math.ceil((config.recentTurns * config.growth ** power) / config.chunkTurns));
  return { detail: chunks(1), short: chunks(2) };
}

const MIN_SUMMARY_TOKENS = 60;

/** How long each summary may be: a tier's budget split across the chunks in that tier. */
export function summaryTargets(config: CompactionConfig): {
  detailTokens: number;
  shortTokens: number;
  epochTokens: number;
} {
  const tiers = tierChunks(config);
  return {
    detailTokens: Math.max(MIN_SUMMARY_TOKENS, Math.floor(config.budgets.detail / tiers.detail)),
    shortTokens: Math.max(MIN_SUMMARY_TOKENS, Math.floor(config.budgets.short / tiers.short)),
    epochTokens: Math.max(MIN_SUMMARY_TOKENS, config.budgets.epoch),
  };
}
