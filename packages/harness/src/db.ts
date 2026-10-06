import { createPgPool, resolveDatabaseUrl } from "@syraa/memory";
import type { Pool } from "pg";

let pool: Pool | null = null;

/** Small shared pool for the harness's own SQL (settings, thread patches). */
export function getHarnessPool(): Pool {
  if (!pool) pool = createPgPool(resolveDatabaseUrl(), { max: 4 });
  return pool;
}

export async function closeHarnessPool(): Promise<void> {
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end();
}
