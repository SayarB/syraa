import type { RetrieveHit, SearchMaterialsInput } from "@syraa/context";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runWithChatContext } from "../src/chat-run-context.js";

const searchMaterials = vi.fn();
const listResources = vi.fn();

vi.mock("../src/context.js", () => ({
  getContextStore: async () => ({ store: { searchMaterials, listResources } }),
}));

const { searchMaterialsTool, syraaTools } = await import("../src/mastra/tools/materials-tools.js");

function hit(overrides: Partial<RetrieveHit> = {}): RetrieveHit {
  return {
    chunkId: "c1",
    resourceId: "r1",
    documentName: "Principles.pdf",
    sectionTitle: "Tools we use",
    sectionPath: "/doc/tools",
    role: "leaf",
    snippet: "We store embeddings in Chroma.",
    score: 0.0327868,
    matchedBy: ["lexical", "semantic"],
    anchor: {},
    ...overrides,
  };
}

async function run(input: { query: string; limit?: number; documentName?: string }) {
  return runWithChatContext({ userId: "u1", threadId: "t1" }, async () => {
    return (await searchMaterialsTool.execute!(input, {} as never)) as Record<string, unknown>;
  });
}

describe("search_materials tool", () => {
  beforeEach(() => {
    searchMaterials.mockReset();
    listResources.mockReset();
  });

  it("is registered with the expected input schema", () => {
    expect(syraaTools.search_materials.id).toBe("search_materials");
    const schema = searchMaterialsTool.inputSchema;
    expect(schema?.safeParse({ query: "chroma" }).success).toBe(true);
    expect(schema?.safeParse({ query: "" }).success).toBe(false);
    expect(schema?.safeParse({ query: "x", limit: 50 }).success).toBe(false);
  });

  it("maps store hits for the current user", async () => {
    searchMaterials.mockResolvedValue({ hits: [hit()], modeUsed: "hybrid" });
    const result = await run({ query: "chroma", limit: 5 });
    expect(searchMaterials).toHaveBeenCalledWith("u1", {
      query: "chroma",
      limit: 5,
      resourceIds: undefined,
    } satisfies SearchMaterialsInput);
    expect(result).toEqual({
      query: "chroma",
      hits: [
        {
          documentName: "Principles.pdf",
          section: "Tools we use",
          snippet: "We store embeddings in Chroma.",
          score: 0.0328,
          exactMatch: true,
        },
      ],
    });
  });

  it("adds an honest note when nothing matches", async () => {
    searchMaterials.mockResolvedValue({ hits: [], modeUsed: "lexical" });
    const result = await run({ query: "madverse" });
    expect(result.hits).toEqual([]);
    expect(result.note).toContain("No passage");
    expect(result.note).toContain("madverse");
  });

  it("flags semantic-only hits as loose matches", async () => {
    searchMaterials.mockResolvedValue({
      hits: [hit({ matchedBy: ["semantic"] })],
      modeUsed: "hybrid",
    });
    const result = await run({ query: "music distribution" });
    expect(result.note).toContain("loose");
  });

  it("scopes by documentName (ready documents only) and reports unknown documents", async () => {
    listResources.mockResolvedValue([
      { id: "r1", name: "Principles.pdf", status: "ready" },
      { id: "r2", name: "Syllabus.pdf", status: "processing" },
    ]);
    searchMaterials.mockResolvedValue({ hits: [], modeUsed: "lexical" });

    await run({ query: "chroma", documentName: "principles" });
    expect(searchMaterials).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ resourceIds: ["r1"] }),
    );

    const missing = await run({ query: "chroma", documentName: "syllabus" });
    expect(missing).toEqual({
      error: 'No ingested document matching "syllabus".',
      availableDocuments: ["Principles.pdf"],
    });
    expect(listResources).toHaveBeenCalledWith("u1", 1000);
  });

  it("says a scoped empty search only covered that document", async () => {
    listResources.mockResolvedValue([{ id: "r1", name: "Principles.pdf", status: "ready" }]);
    searchMaterials.mockResolvedValue({ hits: [], modeUsed: "lexical" });
    const result = await run({ query: "madverse", documentName: "principles" });
    expect(result.note).toBe(
      'No passage in "principles" mentions "madverse". Other documents were not searched.',
    );
  });
});
