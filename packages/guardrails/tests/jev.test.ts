import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askJev, type JevTrace } from "../src/jev.js";

const QUESTIONS = {
  score: { type: "noul", instructions: "q", criteria: { true: "t", false: "f" } },
  label: { type: "choice", instructions: "q", criteria: { a: "a", b: "b" } },
} as const;

function jevResponse(answers: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ answers, ...extra }), { status: 200 });
}

describe("askJev", () => {
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

  it("sends the bearer key, model, state and questions", async () => {
    fetchMock.mockResolvedValue(
      jevResponse({ score: { noul: 0.4 }, label: { choice: "a" } }, { model: "jev-x" }),
    );

    const answers = await askJev("some state", QUESTIONS);

    expect(answers).toEqual({ score: 0.4, label: "a" });
    const [url, init] = fetchMock.mock.calls[0];
    const request = init as RequestInit;
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect((request.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    expect(JSON.parse(request.body as string)).toEqual({
      model: "jev-latest",
      state: "some state",
      questions: QUESTIONS,
    });
  });

  it("throws without a key", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "");
    await expect(askJev("s", QUESTIONS)).rejects.toThrow("TYPESAFE_API_KEY not set");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws on an HTTP error", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));
    await expect(askJev("s", QUESTIONS)).rejects.toThrow("jev HTTP 500");
  });

  it("throws when an answer is missing or the wrong type", async () => {
    fetchMock.mockResolvedValue(jevResponse({ score: { noul: 0.4 } }));
    await expect(askJev("s", QUESTIONS)).rejects.toThrow("jev answer missing: label");

    fetchMock.mockResolvedValue(jevResponse({ score: { noul: "high" }, label: { choice: "a" } }));
    await expect(askJev("s", QUESTIONS)).rejects.toThrow("jev answer missing: score");
  });

  it("passes the timeout to the request signal", async () => {
    fetchMock.mockImplementation(async () =>
      jevResponse({ score: { noul: 1 }, label: { choice: "b" } }),
    );
    const timeout = vi.spyOn(AbortSignal, "timeout");

    await askJev("s", QUESTIONS, { timeoutMs: 1234 });
    expect(timeout).toHaveBeenLastCalledWith(1234);

    await askJev("s", QUESTIONS);
    expect(timeout).toHaveBeenLastCalledWith(3000);
    timeout.mockRestore();
  });

  it("reports success and failure to the trace hook", async () => {
    const end = vi.fn();
    const fail = vi.fn();
    const start = vi.fn(() => ({ end, fail }));
    const trace: JevTrace = { start };

    fetchMock.mockResolvedValueOnce(
      jevResponse(
        { score: { noul: 0.2 }, label: { choice: "b" } },
        { model: "jev-y", usage: { input_tokens: 3, output_tokens: 1 } },
      ),
    );
    await askJev("s", QUESTIONS, { trace });
    expect(start).toHaveBeenCalledWith({ state: "s", questions: QUESTIONS });
    expect(end).toHaveBeenCalledWith({
      answers: { score: 0.2, label: "b" },
      model: "jev-y",
      usage: { input_tokens: 3, output_tokens: 1 },
    });

    fetchMock.mockResolvedValueOnce(new Response("", { status: 503 }));
    await expect(askJev("s", QUESTIONS, { trace })).rejects.toThrow("jev HTTP 503");
    expect(fail).toHaveBeenCalledTimes(1);
  });
});
