import { describe, expect, it } from "vitest";
import { buildUploadDriveKey, fileExtension } from "../src/drive.js";
import { INGEST_QUEUE_KEY, parseJobPayload } from "../src/protocol.js";

describe("ingest protocol", () => {
  it("exposes queue key", () => {
    expect(INGEST_QUEUE_KEY).toBe("syraa:ingest:queue");
  });

  it("parses job payloads", () => {
    const job = parseJobPayload(
      JSON.stringify({
        jobId: "j1",
        userId: "u1",
        resourceId: "r1",
        driveKey: "u1/uploads/r1/a.pdf",
        filePath: "/data/drive/u1/uploads/r1/a.pdf",
        mime: "application/pdf",
        name: "a.pdf",
      }),
    );
    expect(job.resourceId).toBe("r1");
  });

  it("builds drive keys", () => {
    expect(buildUploadDriveKey("demo", "rid", "notes.pdf")).toBe("demo/uploads/rid/notes.pdf");
    expect(fileExtension("notes.PDF")).toBe("pdf");
  });
});
