import { describe, expect, it } from "vitest";
import {
  applyChunk,
  applyMerge,
  type ChunkSummary,
  emptyCompactionState,
  lastCoveredMessageId,
  parseCompactionState,
  renderSummaryBlock,
  resolveCompactionConfig,
} from "../src/index.js";

const config = resolveCompactionConfig();

function chunk(index: number): ChunkSummary {
  return {
    index,
    fromTurn: index * 4,
    toTurn: index * 4 + 3,
    fromPos: index * 8 + 1,
    toPos: index * 8 + 8,
    fromId: `a${index}`,
    toId: `z${index}`,
    detail: `DETAIL-${index}`,
    short: `SHORT-${index}`,
  };
}

function stateWith(count: number) {
  let state = emptyCompactionState(new Date(0));
  for (let i = 0; i < count; i++) state = applyChunk(state, chunk(i));
  return state;
}

describe("parseCompactionState", () => {
  it("round-trips through JSON", () => {
    let state = stateWith(6);
    state = applyMerge(state, "the epoch");
    expect(parseCompactionState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it("ignores anything malformed or from another version", () => {
    expect(parseCompactionState(null)).toBeNull();
    expect(parseCompactionState("nope")).toBeNull();
    expect(parseCompactionState({ ...stateWith(1), version: 2 })).toBeNull();
    expect(parseCompactionState({ ...stateWith(1), rev: "3" })).toBeNull();
    expect(parseCompactionState({ ...stateWith(1), chunks: [{ index: 0 }] })).toBeNull();
    expect(parseCompactionState({ ...stateWith(1), epoch: { text: 1 } })).toBeNull();
  });
});

describe("lastCoveredMessageId", () => {
  it("is the newest chunk's last message, else the epoch's, else null", () => {
    expect(lastCoveredMessageId(emptyCompactionState())).toBeNull();
    expect(lastCoveredMessageId(stateWith(2))).toBe("z1");
  });
});

describe("renderSummaryBlock", () => {
  it("is null before anything is summarised", () => {
    expect(renderSummaryBlock(emptyCompactionState(), config)).toBeNull();
  });

  it("shows detail for recent chunks, short for older ones, and the epoch note first", () => {
    // chunks 0..5 → ages 5..0: ages 0–1 detail, 2–4 short; chunk 0 (age 5) is folded into the epoch
    let state = stateWith(6);
    state = applyMerge(state, "EPOCH-NOTE");
    const block = renderSummaryBlock(state, config) as string;

    const order = ["EPOCH-NOTE", "SHORT-1", "SHORT-2", "SHORT-3", "DETAIL-4", "DETAIL-5"];
    const positions = order.map((text) => block.indexOf(text));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);

    expect(block).not.toContain("DETAIL-1");
    expect(block).not.toContain("SHORT-5");
    expect(block).toContain("Messages 1–8 (brief overview)");
    expect(block).toContain("Messages 41–48:");
    expect(block).toContain("thread_history");
  });
});
