import type { CompactionConfig } from "./config.js";
import { chunkLevel } from "./plan.js";
import type { CompactionState } from "./state.js";

const HEADER =
  "Older turns of this conversation, summarised automatically. Details may be missing or imprecise, and the newest turns follow in full. For the exact wording of anything here, call thread_history.";

/**
 * The text that stands in for the summarised part of the thread, oldest first. Older material is
 * shorter. Returns null when nothing has been summarised yet.
 */
export function renderSummaryBlock(
  state: CompactionState,
  config: CompactionConfig,
): string | null {
  if (!state.epoch && state.chunks.length === 0) return null;

  const lines = [HEADER, ""];
  if (state.epoch) {
    lines.push(`- Messages 1–${state.epoch.throughPos} (brief overview): ${state.epoch.text}`);
  }

  const newest = state.chunks.at(-1)?.index ?? 0;
  for (const chunk of state.chunks) {
    const level = chunkLevel(newest - chunk.index, config);
    const text = level === "detail" ? chunk.detail : chunk.short;
    lines.push(`- Messages ${chunk.fromPos}–${chunk.toPos}: ${text}`);
  }
  return lines.join("\n");
}
