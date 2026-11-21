import { migrateGuardrailsSchema } from "@syraa/guardrails";
import { migrateMemorySchema, resolveDatabaseUrl } from "@syraa/memory";
import { ensureContextReady } from "./context.js";
import { ensureHistoryReady } from "./history-state.js";
import { ensureMastraStorageReady } from "./mastra/storage.js";
import { warmModelCatalogs } from "./model-options.js";
import { ensureSettingsReady } from "./settings.js";

export async function ensureHarnessReady(connectionString?: string): Promise<void> {
  const databaseUrl = resolveDatabaseUrl(connectionString);
  try {
    await migrateMemorySchema(databaseUrl);
    await ensureContextReady(databaseUrl);
    await migrateGuardrailsSchema(databaseUrl);
    await ensureMastraStorageReady(databaseUrl);
    await ensureSettingsReady(databaseUrl);
    await ensureHistoryReady(databaseUrl);
    warmModelCatalogs();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("ECONNREFUSED")) {
      throw new Error(
        "Cannot connect to Postgres at DATABASE_URL.\n" +
          "Start it first:  npm run db:up\n" +
          "Then retry:      npm run dev:ui",
      );
    }
    throw err;
  }
}
