import { describe, expect, it } from "vitest";
import { runWithChatContext } from "../src/chat-run-context.js";
import { fallbackTurnFromToolCache, rememberToolResult } from "../src/tool-call-dedupe.js";

describe("tool call cache", () => {
  it("recovers a doc list when turn resolution fails", async () => {
    await runWithChatContext({ userId: "u1", threadId: "t1" }, async () => {
      rememberToolResult("list_materials", {}, {
        materials: [{ documentName: "THE_BREAKUP.pdf" }, { documentName: "Principles.pdf" }],
      });
      expect(fallbackTurnFromToolCache()).toEqual({
        message: "Available documents:\n- THE_BREAKUP.pdf\n- Principles.pdf",
        lessons: [],
      });
    });
  });

  it("recovers read_materials_section text when turn resolution fails", async () => {
    await runWithChatContext({ userId: "u1", threadId: "t1" }, async () => {
      rememberToolResult(
        "read_materials_section",
        { documentName: "Principles.pdf", sectionTitle: "Chroma" },
        {
          document: "Principles.pdf",
          section: "Chroma",
          text: "ChromaDB is a vector database used for embeddings.",
        },
      );
      expect(fallbackTurnFromToolCache()).toEqual({
        message: "From **Principles.pdf** (Chroma):\n\nChromaDB is a vector database used for embeddings.",
        lessons: [],
      });
    });
  });
});
