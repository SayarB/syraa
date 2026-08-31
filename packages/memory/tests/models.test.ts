import { describe, expect, it } from "vitest";
import { isItemStatus, isItemType, makeScopeKey, validateScopeIds } from "../src/models.js";

describe("models", () => {
  it("makeScopeKey encodes scopes", () => {
    expect(makeScopeKey("user")).toBe("user");
    expect(makeScopeKey("kind", "quiz")).toBe("kind:quiz");
    expect(makeScopeKey("subproject", "quiz", "bio")).toBe("subproject:quiz:bio");
  });

  it("makeScopeKey rejects incomplete scopes", () => {
    expect(() => makeScopeKey("kind")).toThrow(/kindId/);
    expect(() => makeScopeKey("subproject", "quiz")).toThrow(/subproject/);
  });

  it("validateScopeIds normalizes nulls", () => {
    expect(validateScopeIds("user")).toEqual({
      scope: "user",
      kindId: null,
      subprojectId: null,
    });
    expect(validateScopeIds("kind", "quiz")).toEqual({
      scope: "kind",
      kindId: "quiz",
      subprojectId: null,
    });
  });

  it("validateScopeIds rejects mismatched ids", () => {
    expect(() => validateScopeIds("user", "x")).toThrow(/must not set/);
    expect(() => validateScopeIds("kind", "quiz", "bio")).toThrow(/must not set/);
    expect(() => validateScopeIds("kind")).toThrow(/requires kindId/);
    expect(() => validateScopeIds("subproject", "quiz")).toThrow(/requires/);
  });

  it("item type/status guards", () => {
    expect(isItemType("preference")).toBe(true);
    expect(isItemType("suggestion")).toBe(false);
    expect(isItemStatus("active")).toBe(true);
    expect(isItemStatus("archived")).toBe(false);
  });
});
