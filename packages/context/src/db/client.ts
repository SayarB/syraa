import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool, type PoolConfig } from "pg";

export type ContextDb = NodePgDatabase;

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
    max: config.max ?? 10,
    ...config,
  });
}

export function createContextDb(pool: Pool): ContextDb {
  return drizzle({ client: pool });
}

export async function migrateContextSchema(connectionString: string): Promise<void> {
  const pool = createPgPool(connectionString, { max: 1 });
  try {
    const db = createContextDb(pool);
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}

export async function createContextDbFromUrl(
  connectionString?: string,
): Promise<{ pool: Pool; db: ContextDb }> {
  const url = resolveDatabaseUrl(connectionString);
  const pool = createPgPool(url);
  const db = createContextDb(pool);
  return { pool, db };
}
