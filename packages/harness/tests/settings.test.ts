import { randomUUID } from "node:crypto";
import { createPgPool, resolveDatabaseUrl } from "@syraa/memory";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeHarnessPool } from "../src/db.js";
import { resetModelCatalogs } from "../src/model-options.js";
import { ValidationError } from "../src/schemas.js";
import {
  DEFAULT_USER_SETTINGS,
  effectiveModelRef,
  ensureSettingsReady,
  getUserSettings,
  resolveUserSettings,
  SAME_AS_CHAT_MODEL,
  settingsPatchSchema,
  updateUserSettings,
} from "../src/settings.js";

const GLM_FLASH = "accounts/fireworks/models/glm-5p3-flash";

describe("resolveUserSettings", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fills defaults for missing or empty settings", () => {
    expect(resolveUserSettings(undefined)).toEqual(DEFAULT_USER_SETTINGS);
    expect(resolveUserSettings({})).toEqual(DEFAULT_USER_SETTINGS);
    expect(DEFAULT_USER_SETTINGS).toEqual({
      chatModel: SAME_AS_CHAT_MODEL,
      titleModel: SAME_AS_CHAT_MODEL,
      historyCompaction: true,
      historySummaryModel: SAME_AS_CHAT_MODEL,
    });
  });

  it("keeps what was saved, including turning compaction off", () => {
    expect(
      resolveUserSettings({
        chatModel: "gateway:anthropic/claude-haiku-x",
        titleModel: "openai:gpt-4o-mini",
        historyCompaction: false,
        historySummaryModel: "gateway:openai/gpt-5-mini",
      }),
    ).toEqual({
      chatModel: "gateway:anthropic/claude-haiku-x",
      titleModel: "openai:gpt-4o-mini",
      historyCompaction: false,
      historySummaryModel: "gateway:openai/gpt-5-mini",
    });
  });

  it("gives a model saved before providers had names the default provider", () => {
    vi.stubEnv("CHAT_PROVIDER", "fireworks");
    expect(resolveUserSettings({ titleModel: GLM_FLASH }).titleModel).toBe(
      `fireworks:${GLM_FLASH}`,
    );
    vi.stubEnv("CHAT_PROVIDER", "gateway");
    expect(resolveUserSettings({ historySummaryModel: "openai/gpt-5-mini" })).toMatchObject({
      historySummaryModel: "gateway:openai/gpt-5-mini",
    });
  });

  it("falls back to the default for a malformed field, without losing the others", () => {
    expect(
      resolveUserSettings({
        chatModel: 7,
        titleModel: 42,
        historyCompaction: "no",
        historySummaryModel: "",
      }),
    ).toEqual(DEFAULT_USER_SETTINGS);
    expect(resolveUserSettings({ historyCompaction: false, titleModel: 42 })).toEqual({
      ...DEFAULT_USER_SETTINGS,
      historyCompaction: false,
    });
    expect(resolveUserSettings("not an object")).toEqual(DEFAULT_USER_SETTINGS);
  });
});

describe("effectiveModelRef", () => {
  it("makes 'same as chat model' follow the model the user chose to chat with", () => {
    const settings = { ...DEFAULT_USER_SETTINGS, chatModel: "gateway:openai/gpt-5-mini" };
    expect(effectiveModelRef(SAME_AS_CHAT_MODEL, settings)).toBe("gateway:openai/gpt-5-mini");
    expect(effectiveModelRef("gateway:x/y", settings)).toBe("gateway:x/y");
    // no chat model chosen: still "chat", meaning the server default
    expect(effectiveModelRef(SAME_AS_CHAT_MODEL, DEFAULT_USER_SETTINGS)).toBe(SAME_AS_CHAT_MODEL);
  });
});

describe("settingsPatchSchema", () => {
  it("rejects unknown keys", () => {
    expect(settingsPatchSchema.safeParse({ theme: "dark" }).success).toBe(false);
  });

  it("accepts a title model and the history settings", () => {
    expect(settingsPatchSchema.safeParse({ titleModel: GLM_FLASH }).success).toBe(true);
    expect(
      settingsPatchSchema.safeParse({
        chatModel: "gateway:openai/gpt-5-mini",
        historyCompaction: false,
        historySummaryModel: "openai/gpt-5-mini",
      }).success,
    ).toBe(true);
  });

  it("rejects a compaction value that is not a boolean, and a blank model", () => {
    expect(settingsPatchSchema.safeParse({ historyCompaction: "off" }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ historySummaryModel: "  " }).success).toBe(false);
  });
});

describe("updateUserSettings validation", () => {
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
      {
        id: "acme/no-tools",
        name: "No Tools",
        type: "language",
        owned_by: "acme",
        context_window: 128000,
        tags: [],
        supported_parameters: [],
        pricing: { input: "0.000001", output: "0.000002" },
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
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  // The model is checked before anything is written, so none of this needs a database.
  it("rejects a model the provider does not offer, for every model setting", async () => {
    for (const field of ["chatModel", "titleModel", "historySummaryModel"] as const) {
      await expect(updateUserSettings("u", { [field]: "gateway:evil/model" })).rejects.toThrow(
        "unknown model: gateway:evil/model",
      );
    }
    await expect(updateUserSettings("u", { titleModel: "evil/model" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("will not let a model that can't call tools be the chat model", async () => {
    await expect(updateUserSettings("u", { chatModel: "gateway:acme/no-tools" })).rejects.toThrow(
      "No Tools can't run the assistant",
    );
  });

  it("says so, rather than 'unknown model', when the list can't be loaded", async () => {
    resetModelCatalogs();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 503 })),
    );
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(
      updateUserSettings("u", { chatModel: "gateway:openai/gpt-5-mini" }),
    ).rejects.toThrow("model list unavailable");
  });
});

describe.skipIf(!process.env.DATABASE_URL)("user settings store (Postgres)", () => {
  const userId = `settings-test-${randomUUID()}`;

  beforeAll(async () => {
    vi.stubEnv("CHAT_PROVIDER", "fireworks");
    // Saving a Fireworks model needs the provider to have a key and to list the model.
    vi.stubEnv("FIREWORKS_API_KEY", "test-key");
    resetModelCatalogs();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: [{ id: GLM_FLASH, supports_chat: true }] })),
      ),
    );
    await ensureSettingsReady();
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await closeHarnessPool();
    const pool = createPgPool(resolveDatabaseUrl(), { max: 1 });
    await pool.query("DELETE FROM user_settings WHERE user_id = $1", [userId]);
    await pool.end();
  });

  it("tolerates concurrent table creation", async () => {
    await expect(
      Promise.all(Array.from({ length: 4 }, () => ensureSettingsReady())),
    ).resolves.toBeDefined();
  });

  it("returns defaults for a user with no row", async () => {
    expect(await getUserSettings(userId)).toEqual(DEFAULT_USER_SETTINGS);
  });

  it("saves and reads back a title model", async () => {
    const saved = await updateUserSettings(userId, { titleModel: GLM_FLASH });
    // saved in `provider:slug` form
    expect(saved.settings.titleModel).toBe(`fireworks:${GLM_FLASH}`);
    expect((await getUserSettings(userId)).titleModel).toBe(`fireworks:${GLM_FLASH}`);
  });

  it("saves the history settings without touching the title model", async () => {
    const saved = await updateUserSettings(userId, {
      historyCompaction: false,
      historySummaryModel: GLM_FLASH,
    });
    expect(saved.settings).toMatchObject({
      titleModel: `fireworks:${GLM_FLASH}`,
      historyCompaction: false,
      historySummaryModel: `fireworks:${GLM_FLASH}`,
    });
  });

  it("rejects a model the server does not offer", async () => {
    await expect(updateUserSettings(userId, { titleModel: "evil/model" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
