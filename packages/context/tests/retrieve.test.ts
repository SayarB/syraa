import { describe, expect, it } from "vitest";
import { createQueryEmbedder, resolveEmbeddingConfig } from "../src/retrieve/embed.js";
import {
  cosineSimilarity,
  makeSnippet,
  queryTerms,
  reciprocalRankFusion,
  toLikePatterns,
  toOrTsQuery,
} from "../src/retrieve/search.js";

describe("queryTerms", () => {
  it("lowercases, splits on punctuation, drops 1-char tokens, dedupes", () => {
    expect(queryTerms("Chroma-DB & chroma: a vector DB!")).toEqual(["chroma", "db", "vector"]);
  });

  it("drops filler words before the term cap", () => {
    const filler = new Set([
      "can",
      "you",
      "please",
      "tell",
      "me",
      "what",
      "my",
      "say",
      "about",
      "the",
      "of",
    ]);
    const query =
      "can you please tell me what my notes say about the history of the ottoman empire";
    expect(queryTerms(query, filler)).toEqual(["notes", "history", "ottoman", "empire"]);
    expect(queryTerms("the of", filler)).toEqual(["the", "of"]);
  });

  it("keeps words with combining marks (Indic scripts) whole", () => {
    expect(queryTerms("हिन्दी व्याकरण")).toEqual(["हिन्दी", "व्याकरण"]);
  });

  it("keeps unicode letters and caps term count", () => {
    expect(queryTerms("Café über")).toEqual(["café", "über"]);
    expect(queryTerms(Array.from({ length: 20 }, (_, i) => `t${i}`).join(" "))).toHaveLength(12);
  });

  it("returns no terms for punctuation-only input", () => {
    expect(queryTerms("!!! ' & | :*")).toEqual([]);
    expect(toOrTsQuery([])).toBeNull();
  });
});

describe("toOrTsQuery / toLikePatterns", () => {
  it("builds an OR tsquery", () => {
    expect(toOrTsQuery(["chroma", "db"])).toBe("chroma | db");
  });

  it("escapes LIKE wildcards", () => {
    expect(toLikePatterns(["50%", "a_b", "c\\d"])).toEqual(["%50\\%%", "%a\\_b%", "%c\\\\d%"]);
  });
});

describe("cosineSimilarity", () => {
  it("scores identical vectors 1 and orthogonal 0", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it("returns 0 for mismatched dimensions or zero vectors", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("reciprocalRankFusion", () => {
  it("ranks an id present in both lists above single-list ids", () => {
    const fused = reciprocalRankFusion([
      ["a", "shared"],
      ["b", "shared"],
    ]);
    expect(fused[0].id).toBe("shared");
    expect(fused.map((row) => row.id).sort()).toEqual(["a", "b", "shared"]);
  });
});

describe("makeSnippet", () => {
  it("returns short text whole with collapsed whitespace", () => {
    expect(makeSnippet("hello \n  world", ["world"])).toBe("hello world");
  });

  it("centres a window on the first term hit", () => {
    const text = `${"x ".repeat(300)}Madverse distributes music. ${"y ".repeat(300)}`;
    const snippet = makeSnippet(text, ["madverse"], 100);
    expect(snippet).toContain("Madverse");
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
  });

  it("falls back to leading text when no term matches", () => {
    const snippet = makeSnippet(`start ${"z".repeat(500)}`, ["nothing"], 50);
    expect(snippet.startsWith("start")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
  });
});

describe("resolveEmbeddingConfig", () => {
  it("auto prefers Fireworks, then OpenAI, else none", () => {
    expect(resolveEmbeddingConfig({ FIREWORKS_API_KEY: "fw", OPENAI_API_KEY: "oa" })).toEqual({
      provider: "fireworks",
      model: "nomic-ai/nomic-embed-text-v1.5",
      baseUrl: "https://api.fireworks.ai/inference/v1",
      apiKey: "fw",
    });
    expect(resolveEmbeddingConfig({ OPENAI_API_KEY: "oa" })).toMatchObject({
      provider: "openai",
      model: "text-embedding-3-small",
    });
    expect(resolveEmbeddingConfig({})).toEqual({ provider: "none" });
  });

  it("treats empty EMBEDDING_MODEL / BASE_URL as unset (compose passes empty strings)", () => {
    expect(
      resolveEmbeddingConfig({
        EMBEDDING_PROVIDER: "fireworks",
        EMBEDDING_MODEL: "",
        EMBEDDING_BASE_URL: "",
        EMBEDDING_API_KEY: "k",
      }),
    ).toMatchObject({ model: "nomic-ai/nomic-embed-text-v1.5", apiKey: "k" });
  });

  it("recognizes hash / none and rejects unknown providers", () => {
    expect(resolveEmbeddingConfig({ EMBEDDING_PROVIDER: "hash" })).toEqual({ provider: "hash" });
    expect(resolveEmbeddingConfig({ EMBEDDING_PROVIDER: "off" })).toEqual({ provider: "none" });
    expect(() => resolveEmbeddingConfig({ EMBEDDING_PROVIDER: "nope" })).toThrow();
  });
});

describe("createQueryEmbedder", () => {
  it("is null when embeddings are hash-stubbed, off, keyless, or misconfigured", () => {
    expect(createQueryEmbedder({ EMBEDDING_PROVIDER: "hash" })).toBeNull();
    expect(createQueryEmbedder({ EMBEDDING_PROVIDER: "none", FIREWORKS_API_KEY: "fw" })).toBeNull();
    expect(createQueryEmbedder({ EMBEDDING_PROVIDER: "openai" })).toBeNull();
    expect(createQueryEmbedder({ EMBEDDING_PROVIDER: "nope" })).toBeNull();
  });

  it("returns an embedder for a remote provider", () => {
    expect(typeof createQueryEmbedder({ FIREWORKS_API_KEY: "fw" })).toBe("function");
  });
});
