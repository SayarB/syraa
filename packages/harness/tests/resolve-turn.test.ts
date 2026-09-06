import { describe, expect, it } from "vitest";
import { runWithChatContext } from "../src/chat-run-context.js";
import { rememberToolResult } from "../src/tool-call-dedupe.js";
import { resolveTurnFromGenerateOutput } from "../src/mastra/resolve-turn.js";
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

  it("falls back to cached list_materials when agent text is empty", async () => {
    await runWithChatContext({ userId: "u1", threadId: "t1" }, async () => {
      rememberToolResult("list_materials", {}, {
        materials: [{ documentName: "doc-a.pdf" }],
      });

      await expect(
        resolveTurnFromGenerateOutput({
          text: "",
        }),
      ).resolves.toEqual({
        message: "Available documents:\n- doc-a.pdf",
        lessons: [],
      });
    });
  });
});
