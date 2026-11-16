import { createPgPool, resolveDatabaseUrl } from "@syraa/memory";
import type { Pool } from "pg";

let pool: Pool | null = null;

/** Small shared pool for the harness's own SQL (settings, thread patches). */
export function getHarnessPool(): Pool {
  if (!pool) pool = createPgPool(resolveDatabaseUrl(), { max: 4 });
  return pool;
}

/**
 * Postgres errors from two `CREATE TABLE IF NOT EXISTS` racing (e.g. two processes booting at
 * once): the loser fails on the catalog's unique index even though the table now exists.
 */
const CONCURRENT_CREATE_CODES = new Set(["23505", "42P07"]);

/** Run one idempotent `CREATE TABLE IF NOT EXISTS` statement at boot, tolerating a concurrent boot. */
export async function ensureTable(
  createStatement: string,
  connectionString?: string,
): Promise<void> {
  const setupPool = createPgPool(resolveDatabaseUrl(connectionString), { max: 1 });
  try {
    await setupPool.query(createStatement);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (!code || !CONCURRENT_CREATE_CODES.has(code)) throw error;
  } finally {
    await setupPool.end();
  }
}

export async function closeHarnessPool(): Promise<void> {
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end();
}
