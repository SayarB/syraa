import { describe, expect, it } from "vitest";
import { turnFromAgentText, turnFromStructuredObject } from "../src/mastra/resolve-turn.js";

describe("resolve-turn", () => {
  it("reads structured object from Mastra", () => {
    expect(
      turnFromStructuredObject({
        message: "Got it.",
        lessons: [{ text: "Prefers concise answers", kind: "preference" }],
      }),
    ).toEqual({
      message: "Got it.",
      lessons: [{ text: "Prefers concise answers", kind: "preference" }],
    });
  });

  it("falls back to JSON text", () => {
    expect(
      turnFromAgentText(
        JSON.stringify({
          message: "Hello",
          lessons: [{ text: "Prefers concise answers", kind: "preference" }],
        }),
      ),
    ).toEqual({
      message: "Hello",
      lessons: [{ text: "Prefers concise answers", kind: "preference" }],
    });
  });
});
