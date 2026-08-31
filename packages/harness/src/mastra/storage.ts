import { resolveDatabaseUrl } from "@syraa/memory";
import { PostgresStore } from "@mastra/pg";

let store: PostgresStore | null = null;
let initPromise: Promise<void> | null = null;

export function getMastraStorage(connectionString?: string): PostgresStore {
  if (!store) {
    store = new PostgresStore({
      id: "syraa-mastra",
      connectionString: resolveDatabaseUrl(connectionString),
    });
  }
  return store;
}

/** Ensure Mastra `mastra_*` tables exist on the shared Postgres. */
export async function ensureMastraStorageReady(connectionString?: string): Promise<void> {
  const storage = getMastraStorage(connectionString);
  if (!initPromise) {
    initPromise = storage.init();
  }
  await initPromise;
}

export async function closeMastraStorage(): Promise<void> {
  if (!store) return;
  const current = store;
  store = null;
  initPromise = null;
  await current.close();
}
