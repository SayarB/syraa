import { describe, expect, it } from "vitest";
import {
  collectTextUnderNode,
  findAllDocumentText,
  findSectionContent,
  joinTextsWithLimit,
  normalizeTitle,
  resolveResourceIdByName,
} from "../src/materials-retrieve.js";
import { syraaTools } from "../src/mastra/tools/materials-tools.js";
import type { TopicTreeNode } from "@syraa/context";

const sampleTree: TopicTreeNode[] = [
  {
    id: "root",
    kind: "topic",
    title: "THE_BREAKUP.pdf",
    depth: 0,
    ordinal: 0,
    children: [
      {
        id: "intro",
        kind: "topic",
        title: "I. Introduction",
        depth: 1,
        ordinal: 0,
        children: [
          {
            id: "chunk-1",
            kind: "chunk",
            title: "chunk-1",
            depth: 2,
            ordinal: 0,
            text: "Opening paragraph about the breakup.",
            children: [],
          },
        ],
      },
      {
        id: "methods",
        kind: "topic",
        title: "II. Methods",
        depth: 1,
        ordinal: 1,
        children: [
          {
            id: "chunk-2",
            kind: "chunk",
            title: "chunk-2",
            depth: 2,
            ordinal: 0,
            text: "Methods detail text.",
            children: [],
          },
        ],
      },
    ],
  },
];

describe("materials-retrieve", () => {
  it("normalizes titles for matching", () => {
    expect(normalizeTitle("  I. Introduction ")).toBe("i. introduction");
  });

  it("resolves document names fuzzily", () => {
    const materials = [{ resourceId: "r1", name: "THE_BREAKUP.pdf" }];
    expect(resolveResourceIdByName(materials, "the breakup.pdf")).toBe("r1");
  });

  it("finds section content by partial title", () => {
    const match = findSectionContent(sampleTree, "introduction");
    expect(match?.matchedTitle).toBe("I. Introduction");
    expect(match?.texts).toEqual(["Opening paragraph about the breakup."]);
  });

  it("collects all document text", () => {
    expect(findAllDocumentText(sampleTree)).toEqual([
      "Opening paragraph about the breakup.",
      "Methods detail text.",
    ]);
  });

  it("joins text with a character limit", () => {
    const joined = joinTextsWithLimit(["abc", "def"], 5);
    expect(joined.truncated).toBe(true);
    expect(joined.text).toBe("abc");
  });

  it("collects nested chunk text under a topic", () => {
    const texts = collectTextUnderNode(sampleTree[0]!);
    expect(texts).toHaveLength(2);
  });
});

describe("syraaTools", () => {
  it("registers materials tools on the agent", () => {
    expect(Object.keys(syraaTools).sort()).toEqual(["list_materials", "read_materials_section"]);
    expect(syraaTools.read_materials_section.id).toBe("read_materials_section");
  });
});
