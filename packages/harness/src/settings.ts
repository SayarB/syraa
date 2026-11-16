import { createPgPool, resolveDatabaseUrl } from "@syraa/memory";
import { z } from "zod";
import { getHarnessPool } from "./db.js";
import { getModelOptions, isModelAvailable, type ModelOptions } from "./model-options.js";
import { ValidationError } from "./schemas.js";

/** Model setting value meaning "reuse the chat model". */
export const SAME_AS_CHAT_MODEL = "chat";

export type { ModelOption, ModelOptions } from "./model-options.js";

/** Per-user settings. Every field has a default, so adding one needs no migration. */
export type UserSettings = {
  /** Model that writes a short title for each new chat. */
  titleModel: string;
  /** Replace older turns of a long chat with short summaries (see @syraa/history). */
  historyCompaction: boolean;
  /** Model that writes those summaries. */
  historySummaryModel: string;
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  titleModel: SAME_AS_CHAT_MODEL,
  historyCompaction: true,
  historySummaryModel: SAME_AS_CHAT_MODEL,
};

export type SettingsResponse = {
  settings: UserSettings;
};

/**
 * Stored JSON is loose: a field that is missing or malformed gets its default. Model slugs are not
 * checked against the provider's list here (that list is fetched over the network): they are
 * checked when saved, and again when used.
 */
const storedSettingsSchema = z.object({
  titleModel: z.string().trim().min(1).optional().catch(undefined),
  historyCompaction: z.boolean().optional().catch(undefined),
  historySummaryModel: z.string().trim().min(1).optional().catch(undefined),
});

export function resolveUserSettings(stored: unknown): UserSettings {
  const parsed = storedSettingsSchema.safeParse(stored ?? {});
  const raw = parsed.success ? parsed.data : {};
  return {
    titleModel: raw.titleModel ?? DEFAULT_USER_SETTINGS.titleModel,
    historyCompaction: raw.historyCompaction ?? DEFAULT_USER_SETTINGS.historyCompaction,
    historySummaryModel: raw.historySummaryModel ?? DEFAULT_USER_SETTINGS.historySummaryModel,
  };
}

const CREATE_USER_SETTINGS_TABLE = `
  CREATE TABLE IF NOT EXISTS user_settings (
    user_id text PRIMARY KEY,
    settings jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
  )
`;

/**
 * Postgres errors from two `CREATE TABLE IF NOT EXISTS` racing (e.g. two processes booting at
 * once): the loser fails on the catalog's unique index even though the table now exists.
 */
const CONCURRENT_CREATE_CODES = new Set(["23505", "42P07"]);

/** Create the `user_settings` table if missing (idempotent; runs at boot). */
export async function ensureSettingsReady(connectionString?: string): Promise<void> {
  const setupPool = createPgPool(resolveDatabaseUrl(connectionString), { max: 1 });
  try {
    await setupPool.query(CREATE_USER_SETTINGS_TABLE);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (!code || !CONCURRENT_CREATE_CODES.has(code)) throw error;
  } finally {
    await setupPool.end();
  }
}

export async function getUserSettings(userId: string): Promise<UserSettings> {
  const result = await getHarnessPool().query<{ settings: unknown }>(
    "SELECT settings FROM user_settings WHERE user_id = $1",
    [userId],
  );
  return resolveUserSettings(result.rows[0]?.settings);
}

export async function getSettingsResponse(userId: string): Promise<SettingsResponse> {
  return { settings: await getUserSettings(userId) };
}

/** Models the settings pickers offer (besides "same as chat"). Fetched on demand, apart from the settings themselves. */
export async function getModelOptionsResponse(): Promise<ModelOptions> {
  try {
    return await getModelOptions();
  } catch (error) {
    throw new ValidationError(
      `model list unavailable right now: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export const settingsPatchSchema = z
  .object({
    titleModel: z.string().trim().min(1).optional(),
    historyCompaction: z.boolean().optional(),
    historySummaryModel: z.string().trim().min(1).optional(),
  })
  .strict();

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

/** Merge `patch` into the user's stored settings. Rejects values this server does not offer. */
export async function updateUserSettings(
  userId: string,
  patch: SettingsPatch,
): Promise<SettingsResponse> {
  for (const slug of [patch.titleModel, patch.historySummaryModel]) {
    if (slug === undefined || slug === SAME_AS_CHAT_MODEL) continue;
    let available: boolean;
    try {
      available = await isModelAvailable(slug);
    } catch {
      throw new ValidationError("model list unavailable right now; try again in a moment");
    }
    if (!available) throw new ValidationError(`unknown model: ${slug}`);
  }

  const result = await getHarnessPool().query<{ settings: unknown }>(
    `INSERT INTO user_settings (user_id, settings, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (user_id)
     DO UPDATE SET settings = user_settings.settings || EXCLUDED.settings, updated_at = now()
     RETURNING settings`,
    [userId, JSON.stringify(patch)],
  );
  return { settings: resolveUserSettings(result.rows[0]?.settings) };
}
