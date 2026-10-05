import { closeMastraStorage, ensureMastraStorageReady } from "../src/mastra/storage.js";
import { ensureSettingsReady } from "../src/settings.js";

/**
 * Create the harness's own tables once, before test files run in parallel: concurrent
 * `CREATE TABLE IF NOT EXISTS` on a fresh database can fail on Postgres's catalog index.
 */
export default async function globalSetup(): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  await ensureSettingsReady();
  await ensureMastraStorageReady();
  await closeMastraStorage();
}
