import { describe, expect, it } from "vitest";
import { isResourceStatus, RESOURCE_STATUSES, utcNow } from "../src/models.js";

describe("context models", () => {
  it("validates resource statuses", () => {
    expect(RESOURCE_STATUSES).toContain("pending_ingest");
    expect(isResourceStatus("ready")).toBe(true);
    expect(isResourceStatus("nope")).toBe(false);
  });

  it("formats utc timestamps", () => {
    expect(utcNow()).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });
});
