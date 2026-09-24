import type { MemoryItem, MemoryService } from "@syraa/memory";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { lastAssistantMessageText, generate } = vi.hoisted(() => ({
  lastAssistantMessageText: vi.fn<() => Promise<string | null>>(),
  generate: vi.fn<() => Promise<{ text: string }>>(),
}));

vi.mock("../src/threads.js", () => ({ lastAssistantMessageText }));
vi.mock("../src/mastra/index.js", () => ({ getLessonWriterAgent: () => ({ generate }) }));

import {
  type GatedLesson,
  gateLesson,
  lessonBand,
  splitSentences,
  stripCodeBlocks,
} from "../src/lesson-gate.js";
import { applyLessons } from "../src/lessons.js";

type TurnScores = {
  strict: number;
  reveals: number;
  explicitness: string;
  kind?: string;
  self_contained: number;
};

function jevTurn(scores: TurnScores) {
  return {
    answers: {
      strict: { type: "noul", noul: scores.strict },
      reveals: { type: "noul", noul: scores.reveals },
      explicitness: { type: "choice", choice: scores.explicitness },
      kind: { type: "choice", choice: scores.kind ?? "preference" },
      self_contained: { type: "noul", noul: scores.self_contained },
    },
  };
}

function jevSentence(reveals: number, selfContained: number) {
  return {
    answers: {
      reveals: { type: "noul", noul: reveals },
      self_contained: { type: "noul", noul: selfContained },
    },
  };
}

const okJson = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function stateOf(call: unknown[]): string {
  return JSON.parse((call[1] as RequestInit).body as string).state;
}

const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();
const baseOpts = { userId: "u1", threadId: "t1" };

beforeEach(() => {
  vi.stubEnv("TYPESAFE_API_KEY", "test-key");
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  lastAssistantMessageText.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetchMock.mockReset();
  generate.mockReset();
  lastAssistantMessageText.mockReset();
});

describe("lessonBand (frozen eval rule)", () => {
  it.each([
    ["explicit ask", { strict: 0.81, reveals: 0.92, explicitness: "explicit" }, "auto"],
    ["implicit aside", { strict: 0.33, reveals: 0.85, explicitness: "implicit" }, "pending"],
    [
      "quoted email with memory words",
      { strict: 0.78, reveals: 0.34, explicitness: "explicit" },
      "drop",
    ],
    ["research question", { strict: 0.02, reveals: 0.07, explicitness: "none" }, "drop"],
    [
      "both questions just over 0.5",
      { strict: 0.55, reveals: 0.55, explicitness: "implicit" },
      "pending",
    ],
  ])("%s → %s", (_label, scores, band) => {
    expect(lessonBand(scores)).toBe(band);
  });
});

describe("stripCodeBlocks", () => {
  it("removes fenced blocks, including an unterminated one", () => {
    expect(stripCodeBlocks("fix this\n```ts\n// always validate input\n```\nplease")).toBe(
      "fix this please",
    );
    expect(stripCodeBlocks("why?\n```py\n# TODO: always use UTC")).toBe("why?");
  });
});

describe("splitSentences", () => {
  it("keeps a closing quote inside its sentence", () => {
    expect(splitSentences('I read about "design pairs." When I plan, I like two options.')).toEqual(
      ['I read about "design pairs."', "When I plan, I like two options."],
    );
  });
});

describe("gateLesson", () => {
  it("fails closed without an API key and makes no request", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "");
    await expect(gateLesson({ ...baseOpts, userMessage: "Always use metric." })).resolves.toEqual(
      [],
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(lastAssistantMessageText).not.toHaveBeenCalled();
  });

  it("fails closed on HTTP errors", async () => {
    fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));
    await expect(gateLesson({ ...baseOpts, userMessage: "Always use metric." })).resolves.toEqual(
      [],
    );
  });

  it("fails closed on timeout / network failure", async () => {
    fetchMock.mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    await expect(gateLesson({ ...baseOpts, userMessage: "Always use metric." })).resolves.toEqual(
      [],
    );
  });

  it("fails closed when an answer is missing", async () => {
    fetchMock.mockResolvedValue(okJson({ answers: { strict: { type: "noul", noul: 0.9 } } }));
    await expect(gateLesson({ ...baseOpts, userMessage: "Always use metric." })).resolves.toEqual(
      [],
    );
  });

  it("never sends fenced code to Jev", async () => {
    fetchMock.mockResolvedValue(
      okJson(jevTurn({ strict: 0.05, reveals: 0.1, explicitness: "none", self_contained: 0.2 })),
    );
    await gateLesson({
      ...baseOpts,
      userMessage: "why is this off?\n```py\n# TODO: always use UTC here\nts = now()\n```",
    });
    const state = stateOf(fetchMock.mock.calls[0]);
    expect(state).not.toContain("always use UTC");
    expect(state).toContain("why is this off?");
  });

  it("includes the previous assistant message in the state", async () => {
    fetchMock.mockResolvedValue(
      okJson(jevTurn({ strict: 0.05, reveals: 0.1, explicitness: "none", self_contained: 0.2 })),
    );
    lastAssistantMessageText.mockResolvedValueOnce("Want me to keep answers short going forward?");
    await gateLesson({ ...baseOpts, userMessage: "yes please" });
    expect(stateOf(fetchMock.mock.calls[0])).toContain(
      "Want me to keep answers short going forward?",
    );

    await gateLesson({ ...baseOpts, userMessage: "yes please" });
    expect(stateOf(fetchMock.mock.calls[1])).toContain("(none — start of conversation)");
  });

  it("drops without calling the writer", async () => {
    fetchMock.mockResolvedValue(
      okJson(jevTurn({ strict: 0.02, reveals: 0.07, explicitness: "none", self_contained: 0.2 })),
    );
    await expect(
      gateLesson({ ...baseOpts, userMessage: "Best mechanical keyboards under 10k?" }),
    ).resolves.toEqual([]);
    expect(generate).not.toHaveBeenCalled();
  });

  it("stores a self-contained single sentence verbatim and auto-activates an explicit ask", async () => {
    fetchMock.mockResolvedValue(
      okJson(
        jevTurn({
          strict: 0.81,
          reveals: 0.92,
          explicitness: "explicit",
          kind: "rule",
          self_contained: 0.9,
        }),
      ),
    );
    const lessons = await gateLesson({
      ...baseOpts,
      userMessage: "From now on, answer in bullet points.",
    });
    expect(lessons).toEqual<GatedLesson[]>([
      {
        text: "From now on, answer in bullet points.",
        kind: "rule",
        activate: true,
        confidence: "high",
      },
    ]);
    expect(generate).not.toHaveBeenCalled();
  });

  it("uses the writer when the top sentence doesn't stand alone, and keeps it pending", async () => {
    const message =
      "Can you plan a dinner for 8? I don't eat seafood so skip coastal places. Around 1500 per head.";
    fetchMock.mockImplementation(async (_url, init) => {
      const state = JSON.parse(init.body as string).state as string;
      if (state.includes("Can you plan a dinner for 8? I don't eat")) {
        return okJson(
          jevTurn({ strict: 0.3, reveals: 0.8, explicitness: "implicit", self_contained: 0.2 }),
        );
      }
      if (state.includes("seafood")) return okJson(jevSentence(0.9, 0.2));
      return okJson(jevSentence(0.1, 0.5));
    });
    generate.mockResolvedValue({ text: "User doesn't eat seafood." });

    const lessons = await gateLesson({ ...baseOpts, userMessage: message });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0]).toContain(
      "Most relevant part: I don't eat seafood so skip coastal places.",
    );
    expect(lessons).toEqual<GatedLesson[]>([
      {
        text: "User doesn't eat seafood.",
        kind: "preference",
        activate: false,
        confidence: "medium",
      },
    ]);
  });

  it("fails closed when the writer returns nothing", async () => {
    fetchMock.mockResolvedValue(
      okJson(
        jevTurn({ strict: 0.79, reveals: 0.94, explicitness: "explicit", self_contained: 0.17 }),
      ),
    );
    lastAssistantMessageText.mockResolvedValue(
      "Want me to keep answers under 100 words going forward?",
    );
    generate.mockResolvedValue({ text: "" });
    await expect(gateLesson({ ...baseOpts, userMessage: "yes please" })).resolves.toEqual([]);
  });

  it("gives the writer a timeout and fails closed when it aborts", async () => {
    fetchMock.mockResolvedValue(
      okJson(
        jevTurn({ strict: 0.79, reveals: 0.94, explicitness: "explicit", self_contained: 0.17 }),
      ),
    );
    generate.mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    await expect(gateLesson({ ...baseOpts, userMessage: "yes please" })).resolves.toEqual([]);
    expect(generate.mock.calls[0][1].abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("keeps the lesson when one per-sentence Jev call fails", async () => {
    const message = "Quick one about my report. From now on always answer in Hindi. Thanks!";
    fetchMock.mockImplementation(async (_url, init) => {
      const state = JSON.parse(init.body as string).state as string;
      if (state.includes("Quick one about my report. From now on")) {
        return okJson(
          jevTurn({ strict: 0.85, reveals: 0.95, explicitness: "explicit", self_contained: 0.3 }),
        );
      }
      if (state.includes("Hindi")) return okJson(jevSentence(0.95, 0.9));
      throw new DOMException("timed out", "TimeoutError");
    });

    const lessons = await gateLesson({ ...baseOpts, userMessage: message });

    expect(lessons.map((lesson) => [lesson.text, lesson.activate])).toEqual([
      ["From now on always answer in Hindi.", true],
    ]);
    expect(generate).not.toHaveBeenCalled();
  });

  it("maps an unknown Jev kind to preference", async () => {
    fetchMock.mockResolvedValue(
      okJson(
        jevTurn({
          strict: 0.81,
          reveals: 0.92,
          explicitness: "explicit",
          kind: "Fact",
          self_contained: 0.9,
        }),
      ),
    );
    const lessons = await gateLesson({ ...baseOpts, userMessage: "I'm vegetarian." });
    expect(lessons[0]?.kind).toBe("preference");
  });

  it("gives the writer room to reason before answering", async () => {
    fetchMock.mockResolvedValue(
      okJson(
        jevTurn({ strict: 0.79, reveals: 0.94, explicitness: "explicit", self_contained: 0.17 }),
      ),
    );
    generate.mockResolvedValue({ text: "User wants answers under 100 words." });
    await gateLesson({ ...baseOpts, userMessage: "yes please" });
    expect(generate.mock.calls[0][1].modelSettings.maxOutputTokens).toBeGreaterThanOrEqual(256);
  });
});

describe("applyLessons", () => {
  function fakeService() {
    const createItem = vi.fn(
      async (input: Record<string, unknown>) => ({ ...input, id: "i1" }) as unknown as MemoryItem,
    );
    return { service: { createItem } as unknown as MemoryService, createItem };
  }

  it("skips a near-duplicate lesson within the same turn", async () => {
    const { service, createItem } = fakeService();
    await applyLessons(service, {
      userId: "u1",
      memoryId: "m1",
      existingItems: [],
      lessons: [
        {
          text: "Prefers concise answers.",
          kind: "preference",
          activate: true,
          confidence: "high",
        },
        { text: "Prefers concise answers", kind: "preference", activate: true, confidence: "high" },
      ],
    });
    expect(createItem).toHaveBeenCalledTimes(1);
  });

  it("activates only when the gate says so", async () => {
    const { service, createItem } = fakeService();
    await applyLessons(service, {
      userId: "u1",
      memoryId: "m1",
      existingItems: [],
      lessons: [
        { text: "Always cite the source file.", kind: "rule", activate: true, confidence: "high" },
        {
          text: "User reads everything on their phone.",
          kind: "preference",
          activate: false,
          confidence: "medium",
        },
      ],
    });
    expect(createItem.mock.calls[0][0]).toMatchObject({
      status: "active",
      needsConfirm: false,
      source: "explicit",
      type: "rule",
    });
    expect(createItem.mock.calls[1][0]).toMatchObject({
      status: "pending",
      needsConfirm: true,
      source: "distilled",
      type: "preference",
    });
  });
});
