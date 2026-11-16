import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A fake pool stands in for Postgres, so the "accepted and saved" path runs without a database.
// (The real-database version lives in settings.test.ts and runs in CI.)
const query = vi.fn();
vi.mock("../src/db.js", () => ({
  getHarnessPool: () => ({ query }),
  closeHarnessPool: async () => undefined,
  ensureTable: async () => undefined,
}));

const { resetModelCatalogs } = await import("../src/model-options.js");
const { updateUserSettings } = await import("../src/settings.js");

const gatewayList = {
  data: [
    {
      id: "openai/gpt-5-mini",
      name: "GPT-5 mini",
      type: "language",
      owned_by: "openai",
      context_window: 400000,
      tags: ["tool-use"],
      supported_parameters: ["tools"],
      pricing: { input: "0.00000025", output: "0.000002" },
    },
  ],
};

beforeEach(() => {
  resetModelCatalogs();
  vi.stubEnv("CHAT_PROVIDER", "gateway");
  vi.stubEnv("AI_GATEWAY_API_KEY", "gw-key");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(gatewayList))),
  );
  // The store echoes back what it was asked to save, as the real upsert does for a new user.
  query.mockReset().mockImplementation(async (_sql: string, params: string[]) => ({
    rows: [{ settings: JSON.parse(params[1]) }],
  }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("updateUserSettings (saving)", () => {
  it("saves a valid model in provider:slug form, even when given a bare slug", async () => {
    const saved = await updateUserSettings("u1", {
      chatModel: "gateway:openai/gpt-5-mini",
      titleModel: "openai/gpt-5-mini", // a value from before providers had names
    });

    const stored = JSON.parse(query.mock.calls[0][1][1]);
    expect(stored).toEqual({
      chatModel: "gateway:openai/gpt-5-mini",
      titleModel: "gateway:openai/gpt-5-mini",
    });
    expect(saved.settings).toMatchObject({
      chatModel: "gateway:openai/gpt-5-mini",
      titleModel: "gateway:openai/gpt-5-mini",
      historyCompaction: true,
    });
  });

  it("saves 'same as chat model' and the on/off switch without any model lookup", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const saved = await updateUserSettings("u1", { titleModel: "chat", historyCompaction: false });
    expect(saved.settings).toMatchObject({ titleModel: "chat", historyCompaction: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("writes nothing when the model is rejected", async () => {
    await expect(updateUserSettings("u1", { chatModel: "gateway:evil/model" })).rejects.toThrow(
      "unknown model",
    );
    expect(query).not.toHaveBeenCalled();
  });
});
