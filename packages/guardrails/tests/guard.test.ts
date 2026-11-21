import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineGuard } from "../src/guard.js";

const QUESTIONS = {
  a: { type: "noul", instructions: "q", criteria: { true: "t", false: "f" } },
  b: { type: "noul", instructions: "q", criteria: { true: "t", false: "f" } },
} as const;

const guard = defineGuard({
  name: "test",
  questions: QUESTIONS,
  decide: (answers) => (["a", "b"] as const).filter((id) => answers[id] >= 0.8),
});

function respond(a: number, b: number) {
  return new Response(
    JSON.stringify({ answers: { a: { noul: a }, b: { noul: b } }, model: "jev-test" }),
    { status: 200 },
  );
}

describe("defineGuard", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("TYPESAFE_API_KEY", "test-key");
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("is disabled and makes no call without a key", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "");
    expect(guard.enabled).toBe(false);
    await expect(guard.run("state")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves clean when nothing is flagged", async () => {
    fetchMock.mockResolvedValue(respond(0.1, 0.79));
    const verdict = await guard.run("state");
    expect(verdict).toEqual({
      state: "clean",
      categories: [],
      answers: { a: 0.1, b: 0.79 },
      model: "jev-test",
      error: null,
    });
  });

  it("resolves flagged with the categories from decide", async () => {
    fetchMock.mockResolvedValue(respond(0.9, 0.8));
    const verdict = await guard.run("state");
    expect(verdict?.state).toBe("flagged");
    expect(verdict?.categories).toEqual(["a", "b"]);
  });

  it("resolves unchecked on an HTTP failure instead of rejecting", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 500 }));
    const verdict = await guard.run("state");
    expect(verdict?.state).toBe("unchecked");
    expect(verdict?.error).toBe("jev HTTP 500");
    expect(verdict?.answers).toBeNull();
  });

  it("resolves unchecked on a timeout", async () => {
    fetchMock.mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    const verdict = await guard.run("state");
    expect(verdict?.state).toBe("unchecked");
    expect(verdict?.error).toBeTruthy();
  });

  it("resolves unchecked when decide throws", async () => {
    const broken = defineGuard({
      name: "broken",
      questions: QUESTIONS,
      decide: () => {
        throw new Error("bad rule");
      },
    });
    fetchMock.mockResolvedValue(respond(1, 1));
    const verdict = await broken.run("state");
    expect(verdict?.state).toBe("unchecked");
    expect(verdict?.error).toBe("bad rule");
  });
});
