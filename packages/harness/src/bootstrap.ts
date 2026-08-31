import { migrateMemorySchema, resolveDatabaseUrl } from "@everyday/memory";
import { ensureContextReady } from "./context.js";

export async function ensureHarnessReady(connectionString?: string): Promise<void> {
  const databaseUrl = resolveDatabaseUrl(connectionString);
  try {
    await migrateMemorySchema(databaseUrl);
    await ensureContextReady(databaseUrl);
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
