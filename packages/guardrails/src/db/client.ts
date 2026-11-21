import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool, type PoolConfig } from "pg";

export type GuardrailDb = NodePgDatabase;

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

export function resolveDatabaseUrl(explicit?: string): string {
  const candidate = explicit?.trim();
  const url =
    candidate && /^postgres(ql)?:\/\//i.test(candidate) ? candidate : process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required (set env or pass connection string)");
  }
  return url;
}

export function createPgPool(connectionString: string, config: PoolConfig = {}): Pool {
  return new Pool({
    connectionString,
    max: config.max ?? 5,
    ...config,
  });
}

export function createGuardrailDb(pool: Pool): GuardrailDb {
  return drizzle({ client: pool });
}

export async function migrateGuardrailsSchema(connectionString: string): Promise<void> {
  const pool = createPgPool(connectionString, { max: 1 });
  try {
    await migrate(createGuardrailDb(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

export async function createGuardrailDbFromUrl(
  connectionString?: string,
): Promise<{ pool: Pool; db: GuardrailDb }> {
  const pool = createPgPool(resolveDatabaseUrl(connectionString));
  return { pool, db: createGuardrailDb(pool) };
}
