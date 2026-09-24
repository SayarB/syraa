import { describe, expect, it, vi } from "vitest";

const recall = vi.fn();
vi.mock("../src/mastra/memory.js", () => ({ getSyraaMemory: () => ({ recall }) }));
vi.mock("../src/materials-working-memory.js", () => ({}));

const { lastAssistantMessageText } = await import("../src/threads.js");

function assistant(text: string, createdAt: string) {
  return { role: "assistant", createdAt, content: { parts: [{ type: "text", text }] } };
}

describe("lastAssistantMessageText", () => {
  it("returns the newest reply, keeping its end where offers sit", async () => {
    const long = `${"x".repeat(3000)} Want me to always use metric units?`;
    recall.mockResolvedValue({
      messages: [
        assistant("older", "2026-09-01T00:00:00Z"),
        assistant(long, "2026-09-02T00:00:00Z"),
      ],
    });
    const text = await lastAssistantMessageText({ userId: "u1", threadId: "t1" });
    expect(text).toHaveLength(2000);
    expect(text?.endsWith("Want me to always use metric units?")).toBe(true);
  });
});
