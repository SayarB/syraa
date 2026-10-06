import { randomUUID } from "node:crypto";
import { createPgPool, resolveDatabaseUrl } from "@syraa/memory";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { closeHarnessPool } from "../src/db.js";
import { ValidationError } from "../src/schemas.js";
import {
  DEFAULT_USER_SETTINGS,
  ensureSettingsReady,
  getUserSettings,
  resolveUserSettings,
  SAME_AS_CHAT_MODEL,
  settingsPatchSchema,
  titleModelOptions,
  updateUserSettings,
} from "../src/settings.js";

const GLM_FLASH = "accounts/fireworks/models/glm-5p3-flash";

describe("titleModelOptions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("offers the chat model plus the Fireworks list on Fireworks", () => {
    vi.stubEnv("CHAT_PROVIDER", "fireworks");
    const ids = titleModelOptions().map((option) => option.id);
    expect(ids[0]).toBe(SAME_AS_CHAT_MODEL);
    expect(ids).toContain(GLM_FLASH);
  });

  it("offers only the chat model on OpenAI", () => {
    vi.stubEnv("CHAT_PROVIDER", "openai");
    expect(titleModelOptions().map((option) => option.id)).toEqual([SAME_AS_CHAT_MODEL]);
  });
});

describe("resolveUserSettings", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fills defaults for missing or empty settings", () => {
    expect(resolveUserSettings(undefined)).toEqual(DEFAULT_USER_SETTINGS);
    expect(resolveUserSettings({})).toEqual(DEFAULT_USER_SETTINGS);
  });

  it("keeps a valid title model", () => {
    vi.stubEnv("CHAT_PROVIDER", "fireworks");
    expect(resolveUserSettings({ titleModel: GLM_FLASH }).titleModel).toBe(GLM_FLASH);
  });

  it("falls back when the stored model is no longer offered or malformed", () => {
    vi.stubEnv("CHAT_PROVIDER", "fireworks");
    expect(resolveUserSettings({ titleModel: "gone/model" }).titleModel).toBe(SAME_AS_CHAT_MODEL);
    expect(resolveUserSettings({ titleModel: 42 }).titleModel).toBe(SAME_AS_CHAT_MODEL);
    expect(resolveUserSettings("not an object")).toEqual(DEFAULT_USER_SETTINGS);
  });
});

describe("settingsPatchSchema", () => {
  it("rejects unknown keys", () => {
    expect(settingsPatchSchema.safeParse({ theme: "dark" }).success).toBe(false);
  });

  it("accepts a title model", () => {
    expect(settingsPatchSchema.safeParse({ titleModel: GLM_FLASH }).success).toBe(true);
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
    expect(saved.options.titleModels.map((option) => option.id)).toContain(GLM_FLASH);
    expect((await getUserSettings(userId)).titleModel).toBe(GLM_FLASH);
  });

  it("rejects a model the server does not offer", async () => {
    await expect(updateUserSettings(userId, { titleModel: "evil/model" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
