import { describe, expect, it } from "vitest";
import { runWithChatContext } from "../src/chat-run-context.js";
import {
  fullReplyText,
  resolveTurnFromGenerateOutput,
  stripRuntimeFooters,
} from "../src/mastra/resolve-turn.js";
import { rememberToolResult } from "../src/tool-call-dedupe.js";

describe("stripRuntimeFooters", () => {
  it.each([
    ["Answer.\n\n---\n*Working memory updated*", "Answer."],
    ["Answer.\n**Lesson extracted:** x", "Answer."],
    ["Answer.\n\n_Memory updated_\n", "Answer."],
    ["Part A\n---\nPart B", "Part A\n---\nPart B"],
    ["Plain reply.", "Plain reply."],
  ])("%j → %j", (input, expected) => {
    expect(stripRuntimeFooters(input)).toBe(expected);
  });
});

describe("fullReplyText", () => {
  it("joins every step's text, not just the last step's", () => {
    expect(
      fullReplyText({
        text: "Found it.",
        steps: [{ text: "Let me check. " }, { text: "Found it." }],
      }),
    ).toBe("Let me check.\n\nFound it.");
  });

  it("falls back to text when steps carry none", () => {
    expect(fullReplyText({ text: "Hi", steps: [{ text: "" }] })).toBe("Hi");
    expect(fullReplyText({ text: "Hi" })).toBe("Hi");
  });
});

describe("resolve-turn", () => {
  it("uses the agent text as the reply", async () => {
    await expect(
      resolveTurnFromGenerateOutput({
        text: Promise.resolve("Hello\n\n---\n*Working memory updated*"),
      }),
    ).resolves.toEqual({ message: "Hello" });
  });

  it("falls back to cached list_materials when agent text is empty", async () => {
    await runWithChatContext({ userId: "u1", threadId: "t1" }, async () => {
      rememberToolResult(
        "list_materials",
        {},
        {
          materials: [{ documentName: "doc-a.pdf" }],
        },
      );

      await expect(resolveTurnFromGenerateOutput({ text: "" })).resolves.toEqual({
        message: "Available documents:\n- doc-a.pdf",
      });
    });
  });

  it("falls back to the retry message when the reply is only a footer", async () => {
    await expect(
      resolveTurnFromGenerateOutput({ text: "---\n*Working memory updated*" }),
    ).resolves.toEqual({ message: "I couldn't finish that turn — please try again." });
  });
});
