import { describe, expect, it } from "vitest";
import {
  applyChunk,
  applyMerge,
  boundaryTurns,
  type ChunkSummary,
  chunkLevel,
  emptyCompactionState,
  fallbackActions,
  nextJob,
  resolveCompactionConfig,
  summaryTargets,
  tierChunks,
} from "../src/index.js";

const config = resolveCompactionConfig(); // n=3, k=4, g=2

function fakeChunk(index: number, fromTurn: number, toTurn: number): ChunkSummary {
  return {
    index,
    fromTurn,
    toTurn,
    fromPos: fromTurn * 2 + 1,
    toPos: toTurn * 2 + 2,
    fromId: `m${fromTurn * 2}`,
    toId: `m${toTurn * 2 + 1}`,
    detail: `detail ${index}`,
    short: `short ${index}`,
  };
}

describe("config", () => {
  it("sizes the tiers geometrically", () => {
    expect(tierChunks(config)).toEqual({ detail: 2, short: 3 });
    expect(summaryTargets(config)).toEqual({
      detailTokens: 750,
      shortTokens: 333,
      epochTokens: 500,
    });
  });

  it("rejects values that would break the algorithm", () => {
    expect(() => resolveCompactionConfig({ chunkTurns: 0 })).toThrow(RangeError);
    expect(() => resolveCompactionConfig({ recentTurns: 1.5 })).toThrow(RangeError);
    expect(() => resolveCompactionConfig({ growth: 0.5 })).toThrow(RangeError);
    expect(() => resolveCompactionConfig({ budgets: { epoch: -1 } })).toThrow(RangeError);
  });
});

describe("boundaryTurns", () => {
  it("summarises nothing until a whole chunk has aged past the recent turns", () => {
    expect(boundaryTurns(0, config)).toBe(0);
    expect(boundaryTurns(6, config)).toBe(0);
    expect(boundaryTurns(7, config)).toBe(4);
  });

  it("moves only every chunkTurns turns, so the summarised prefix stays put in between", () => {
    const seen = new Map<number, number[]>();
    for (let turns = 0; turns <= 60; turns++) {
      const boundary = boundaryTurns(turns, config);
      seen.set(boundary, [...(seen.get(boundary) ?? []), turns]);
      expect(boundary % config.chunkTurns).toBe(0);
      expect(boundary).toBeLessThanOrEqual(Math.max(0, turns - config.recentTurns));
    }
    // each boundary value holds for exactly chunkTurns consecutive turn counts. The first (0, which
    // also covers the short start) and the last (cut off where the loop ends) are skipped.
    const boundaries = [...seen.keys()].sort((a, b) => a - b);
    for (const boundary of boundaries.slice(1, -1)) {
      expect(seen.get(boundary)).toHaveLength(config.chunkTurns);
    }
  });
});

describe("chunkLevel", () => {
  it("shows detail, then short, then folds into the epoch note", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((age) => chunkLevel(age, config))).toEqual([
      "detail",
      "detail",
      "short",
      "short",
      "short",
      "epoch",
      "epoch",
    ]);
  });
});

describe("nextJob over a growing thread", () => {
  it("creates each chunk exactly once and keeps only the tiers' worth of chunks", () => {
    let state = emptyCompactionState(new Date(0));
    const jobs: string[] = [];

    for (let turns = 1; turns <= 60; turns++) {
      for (let guard = 0; guard < 20; guard++) {
        const job = nextJob(turns, state, config);
        if (!job) break;
        if (job.kind === "chunk") {
          jobs.push(`chunk:${job.index}`);
          expect(job.toTurn - job.fromTurn + 1).toBe(config.chunkTurns);
          state = applyChunk(state, fakeChunk(job.index, job.fromTurn, job.toTurn));
        } else {
          jobs.push(`merge:${job.index}`);
          state = applyMerge(state, `epoch through chunk ${job.index}`);
        }
      }
      // never more chunks than the detail and short tiers hold
      expect(state.chunks.length).toBeLessThanOrEqual(5);
    }

    const chunkJobs = jobs.filter((job) => job.startsWith("chunk:"));
    expect(new Set(chunkJobs).size).toBe(chunkJobs.length);
    expect(chunkJobs).toHaveLength(boundaryTurns(60, config) / config.chunkTurns);
    expect(state.summarizedTurns).toBe(boundaryTurns(60, config));
    expect(state.epoch?.text).toBe("epoch through chunk 8");
    expect(state.rev).toBe(jobs.length);
  });

  it("does nothing while the thread is short", () => {
    expect(nextJob(6, emptyCompactionState(), config)).toBeNull();
  });
});

describe("state transitions", () => {
  it("refuses a chunk that skips ahead", () => {
    const state = emptyCompactionState();
    expect(() => applyChunk(state, fakeChunk(0, 4, 7))).toThrow();
    expect(() => applyChunk(state, fakeChunk(1, 0, 3))).toThrow();
  });

  it("folds the oldest chunk into the epoch note and records how far it reaches", () => {
    let state = emptyCompactionState();
    state = applyChunk(state, fakeChunk(0, 0, 3));
    state = applyChunk(state, fakeChunk(1, 4, 7));
    const merged = applyMerge(state, "overview");
    expect(merged.chunks.map((chunk) => chunk.index)).toEqual([1]);
    expect(merged.epoch).toEqual({
      text: "overview",
      throughTurn: 3,
      throughPos: 8,
      throughId: "m7",
    });
    expect(() => applyMerge(emptyCompactionState(), "x")).toThrow();
  });
});

describe("fallbackActions", () => {
  const turn = (tokens: number, clippedTokens = 100) => ({ tokens, clippedTokens });

  it("leaves everything alone while under budget", () => {
    expect(fallbackActions([turn(1000), turn(1000), turn(1000)], config)).toEqual([
      "keep",
      "keep",
      "keep",
    ]);
  });

  it("shortens the oldest turns first and never touches the newest recentTurns", () => {
    const turns = Array.from({ length: 8 }, () => turn(2000)); // 16000 > 8000
    const actions = fallbackActions(turns, config);
    expect(actions.slice(-config.recentTurns)).toEqual(["keep", "keep", "keep"]);
    // 5 unprotected turns: shortening oldest-first stops as soon as the total fits
    const firstKept = actions.indexOf("keep");
    expect(actions.slice(0, firstKept).every((action) => action === "clip")).toBe(true);
    expect(actions).not.toContain("drop");
  });

  it("drops oldest turns when shortening is not enough", () => {
    const turns = Array.from({ length: 10 }, () => turn(3000, 2500)); // clipping barely helps
    const actions = fallbackActions(turns, config);
    expect(actions[0]).toBe("drop");
    expect(actions.slice(-config.recentTurns)).toEqual(["keep", "keep", "keep"]);
  });

  it("returns an action per turn even when there are fewer turns than recentTurns", () => {
    expect(fallbackActions([turn(20_000)], config)).toEqual(["keep"]);
  });
});
