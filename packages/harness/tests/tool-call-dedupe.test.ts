import { describe, expect, it } from "vitest";
import { runWithChatContext } from "../src/chat-run-context.js";
import { fallbackTurnFromToolCache, rememberToolResult } from "../src/tool-call-dedupe.js";

describe("tool call cache", () => {
  it("recovers search_materials snippets when turn resolution fails", async () => {
    await runWithChatContext({ userId: "u1", threadId: "t1" }, async () => {
      rememberToolResult("search_materials", { query: "nothing" }, { query: "nothing", hits: [] });
      rememberToolResult(
        "search_materials",
        { query: "chroma" },
        {
          query: "chroma",
          hits: [
            {
              documentName: "Principles.pdf",
              section: "Tools",
              snippet: "We store embeddings in Chroma.",
            },
          ],
        },
      );
      expect(fallbackTurnFromToolCache()).toEqual({
        message:
          "Relevant passages from your materials:\n- **Principles.pdf — Tools**: We store embeddings in Chroma.",
      });
    });
  });

  it("recovers a doc list when turn resolution fails", async () => {
    await runWithChatContext({ userId: "u1", threadId: "t1" }, async () => {
      rememberToolResult(
        "list_materials",
        {},
        {
          materials: [{ documentName: "THE_BREAKUP.pdf" }, { documentName: "Principles.pdf" }],
        },
      );
      expect(fallbackTurnFromToolCache()).toEqual({
        message: "Available documents:\n- THE_BREAKUP.pdf\n- Principles.pdf",
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
        message:
          "From **Principles.pdf** (Chroma):\n\nChromaDB is a vector database used for embeddings.",
      });
    });
  });
});
