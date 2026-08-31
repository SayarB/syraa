import { describe, expect, it } from "vitest";
import { parseTurnJson, turnResultSchema } from "../src/schemas.js";

describe("turnResultSchema", () => {
  it("accepts valid model output", () => {
    const raw = JSON.stringify({
      message: "Hello!",
      lessons: [{ text: "Prefers concise answers", kind: "preference" }],
    });
    expect(parseTurnJson(raw)).toEqual({
      message: "Hello!",
      lessons: [{ text: "Prefers concise answers", kind: "preference" }],
    });
  });

  it("rejects missing message", () => {
    expect(() => parseTurnJson(JSON.stringify({ lessons: [] }))).toThrow(/Invalid model output/);
  });

  it("rejects invalid lesson kind", () => {
    expect(() =>
      parseTurnJson(
        JSON.stringify({
          message: "Hi",
          lessons: [{ text: "nope", kind: "invalid" }],
        }),
      ),
    ).toThrow(/Invalid model output/);
  });

  it("caps lessons at 3 via schema", () => {
    const result = turnResultSchema.safeParse({
      message: "Hi",
      lessons: [
        { text: "a", kind: "rule" },
        { text: "b", kind: "rule" },
        { text: "c", kind: "rule" },
        { text: "d", kind: "rule" },
      ],
    });
    expect(result.success).toBe(false);
  });
});
