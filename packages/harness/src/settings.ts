import { createPgPool, resolveDatabaseUrl } from "@syraa/memory";
import type { Pool } from "pg";
import { z } from "zod";
import { resolveChatProvider } from "./mastra/model.js";
import { ValidationError } from "./schemas.js";

/** `titleModel` value meaning "reuse the chat model". */
export const SAME_AS_CHAT_MODEL = "chat";

export type ModelOption = { id: string; label: string };

/** Fast, low-cost Fireworks models offered for thread titles (checked against the key's model list). */
const FIREWORKS_TITLE_MODELS: ModelOption[] = [
  { id: "accounts/fireworks/models/glm-5p3-flash", label: "GLM 5.3 Flash" },
  { id: "accounts/fireworks/models/deepseek-v4p1-flash", label: "DeepSeek V4.1 Flash" },
];

/** Per-user settings. Every field has a default, so adding one needs no migration. */
export type UserSettings = {
  titleModel: string;
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  titleModel: SAME_AS_CHAT_MODEL,
};

export type SettingsOptions = {
  titleModels: ModelOption[];
};

export type SettingsResponse = {
  settings: UserSettings;
  options: SettingsOptions;
};

/** Title models this server can call: the chat model, plus the Fireworks list when chat runs on Fireworks. */
export function titleModelOptions(): ModelOption[] {
  const options: ModelOption[] = [{ id: SAME_AS_CHAT_MODEL, label: "Same as chat model" }];
  if (resolveChatProvider() === "fireworks") options.push(...FIREWORKS_TITLE_MODELS);
  return options;
}

function settingsOptions(): SettingsOptions {
  return { titleModels: titleModelOptions() };
}

/** Stored JSON is loose: a field that is missing, malformed, or no longer offered gets its default. */
const storedSettingsSchema = z.object({
  titleModel: z.string().optional().catch(undefined),
});

export function resolveUserSettings(stored: unknown): UserSettings {
  const parsed = storedSettingsSchema.safeParse(stored ?? {});
  const raw = parsed.success ? parsed.data : {};
  const titleModel = titleModelOptions().some((option) => option.id === raw.titleModel)
    ? (raw.titleModel as string)
    : DEFAULT_USER_SETTINGS.titleModel;
  return { titleModel };
}

const CREATE_USER_SETTINGS_TABLE = `
  CREATE TABLE IF NOT EXISTS user_settings (
    user_id text PRIMARY KEY,
    settings jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
  )
`;

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) pool = createPgPool(resolveDatabaseUrl(), { max: 2 });
  return pool;
}

/** Create the `user_settings` table if missing (idempotent; runs at boot). */
export async function ensureSettingsReady(connectionString?: string): Promise<void> {
  const setupPool = createPgPool(resolveDatabaseUrl(connectionString), { max: 1 });
  try {
    await setupPool.query(CREATE_USER_SETTINGS_TABLE);
  } finally {
    await setupPool.end();
  }
}

export async function closeSettingsStore(): Promise<void> {
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end();
}

export async function getUserSettings(userId: string): Promise<UserSettings> {
  const result = await getPool().query<{ settings: unknown }>(
    "SELECT settings FROM user_settings WHERE user_id = $1",
    [userId],
  );
  return resolveUserSettings(result.rows[0]?.settings);
}

export async function getSettingsResponse(userId: string): Promise<SettingsResponse> {
  return { settings: await getUserSettings(userId), options: settingsOptions() };
}

export const settingsPatchSchema = z
  .object({
    titleModel: z.string().trim().min(1).optional(),
  })
  .strict();

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

/** Merge `patch` into the user's stored settings. Rejects values this server does not offer. */
export async function updateUserSettings(
  userId: string,
  patch: SettingsPatch,
): Promise<SettingsResponse> {
  if (
    patch.titleModel !== undefined &&
    !titleModelOptions().some((option) => option.id === patch.titleModel)
  ) {
    throw new ValidationError(`unknown title model: ${patch.titleModel}`);
  }

  const result = await getPool().query<{ settings: unknown }>(
    `INSERT INTO user_settings (user_id, settings, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (user_id)
     DO UPDATE SET settings = user_settings.settings || EXCLUDED.settings, updated_at = now()
     RETURNING settings`,
    [userId, JSON.stringify(patch)],
  );
  return { settings: resolveUserSettings(result.rows[0]?.settings), options: settingsOptions() };
}
