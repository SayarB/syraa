import { describe, expect, it } from "vitest";
import { mastraThreadToUiMessages } from "../src/thread-ui-messages.js";

describe("mastraThreadToUiMessages", () => {
  it("preserves tool parts in order with assistant text", () => {
    const messages = mastraThreadToUiMessages([
      {
        id: "u1",
        role: "user",
        createdAt: new Date("2026-09-01T12:00:00Z"),
        content: {
          format: 2,
          parts: [{ type: "text", text: "List my materials" }],
        },
      },
      {
        id: "a1",
        role: "assistant",
        createdAt: new Date("2026-09-01T12:00:01Z"),
        content: {
          format: 2,
          parts: [
            { type: "step-start" },
            {
              type: "tool-invocation",
              toolInvocation: {
                toolCallId: "c1",
                toolName: "list_materials",
                state: "result",
                args: {},
                result: {
                  materials: [
                    {
                      documentName: "THE_BREAKUP.pdf",
                      status: "ready",
                      sectionTitles: ["Opening"],
                    },
                  ],
                },
              },
            },
            { type: "text", text: "You have one document." },
          ],
        },
      },
    ]);

    expect(messages).toHaveLength(2);
    expect(messages[1]?.parts.map((part) => part.type)).toEqual([
      "step-start",
      "tool-list_materials",
      "text",
    ]);
    expect(
      (messages[1]?.parts[1] as { output?: { materials?: unknown[] } }).output?.materials,
    ).toHaveLength(1);
  });
});
