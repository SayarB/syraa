import { randomUUID } from "node:crypto";
import { createPgPool, resolveDatabaseUrl } from "@syraa/memory";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { closeHarnessPool } from "../src/db.js";
import { getModelOptions } from "../src/model-options.js";
import { ValidationError } from "../src/schemas.js";
import {
  DEFAULT_USER_SETTINGS,
  ensureSettingsReady,
  getUserSettings,
  resolveUserSettings,
  SAME_AS_CHAT_MODEL,
  settingsPatchSchema,
  updateUserSettings,
} from "../src/settings.js";

const GLM_FLASH = "accounts/fireworks/models/glm-5p3-flash";

describe("getModelOptions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("offers the short Fireworks list on Fireworks", async () => {
    vi.stubEnv("CHAT_PROVIDER", "fireworks");
    const { provider, models } = await getModelOptions();
    expect(provider).toBe("fireworks");
    expect(models.map((model) => model.id)).toContain(GLM_FLASH);
  });

  it("offers nothing besides the chat model on OpenAI", async () => {
    vi.stubEnv("CHAT_PROVIDER", "openai");
    expect((await getModelOptions()).models).toEqual([]);
  });
});

describe("resolveUserSettings", () => {
  it("fills defaults for missing or empty settings", () => {
    expect(resolveUserSettings(undefined)).toEqual(DEFAULT_USER_SETTINGS);
    expect(resolveUserSettings({})).toEqual(DEFAULT_USER_SETTINGS);
    expect(DEFAULT_USER_SETTINGS).toEqual({
      titleModel: SAME_AS_CHAT_MODEL,
      historyCompaction: true,
      historySummaryModel: SAME_AS_CHAT_MODEL,
    });
  });

  it("keeps what was saved, including turning compaction off", () => {
    expect(
      resolveUserSettings({
        titleModel: GLM_FLASH,
        historyCompaction: false,
        historySummaryModel: "openai/gpt-5-mini",
      }),
    ).toEqual({
      titleModel: GLM_FLASH,
      historyCompaction: false,
      historySummaryModel: "openai/gpt-5-mini",
    });
  });

  it("falls back to the default for a malformed field, without losing the others", () => {
    expect(
      resolveUserSettings({ titleModel: 42, historyCompaction: "no", historySummaryModel: "" }),
    ).toEqual(DEFAULT_USER_SETTINGS);
    expect(resolveUserSettings({ historyCompaction: false, titleModel: 42 })).toEqual({
      ...DEFAULT_USER_SETTINGS,
      historyCompaction: false,
    });
    expect(resolveUserSettings("not an object")).toEqual(DEFAULT_USER_SETTINGS);
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
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // The model is checked before anything is written, so none of this needs a database.
  it("rejects a model the provider does not offer, for either model setting", async () => {
    vi.stubEnv("CHAT_PROVIDER", "fireworks");
    await expect(updateUserSettings("u", { titleModel: "evil/model" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(updateUserSettings("u", { historySummaryModel: "evil/model" })).rejects.toThrow(
      "unknown model: evil/model",
    );
  });
});

describe.skipIf(!process.env.DATABASE_URL)("user settings store (Postgres)", () => {
  const userId = `settings-test-${randomUUID()}`;

  beforeAll(async () => {
    vi.stubEnv("CHAT_PROVIDER", "fireworks");
    await ensureSettingsReady();
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
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
    expect(saved.settings.titleModel).toBe(GLM_FLASH);
    expect((await getUserSettings(userId)).titleModel).toBe(GLM_FLASH);
  });

  it("saves the history settings without touching the title model", async () => {
    const saved = await updateUserSettings(userId, {
      historyCompaction: false,
      historySummaryModel: GLM_FLASH,
    });
    expect(saved.settings).toMatchObject({
      titleModel: GLM_FLASH,
      historyCompaction: false,
      historySummaryModel: GLM_FLASH,
    });
  });

  it("rejects a model the server does not offer", async () => {
    await expect(updateUserSettings(userId, { titleModel: "evil/model" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
