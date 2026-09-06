/**
 * Programmatic Better Auth schema migrate (Kysely / pg Pool).
 * Used by Docker entrypoint — no `npx auth` download at boot.
 */
import { getMigrations } from "better-auth/db/migration";
import { betterAuth } from "better-auth";
import { Pool } from "pg";

async function main(): Promise<void> {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!secret || !databaseUrl) {
    throw new Error("Set BETTER_AUTH_SECRET and DATABASE_URL before auth migrate");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const auth = betterAuth({
      database: pool,
      baseURL: process.env.BETTER_AUTH_URL?.trim() || "http://localhost:3000",
      secret,
      emailAndPassword: {
        enabled: true,
        requireEmailVerification: false,
      },
    });

    const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(auth.options);
    if (toBeCreated.length === 0 && toBeAdded.length === 0) {
      console.log("Better Auth schema up to date");
      return;
    }

    console.log(
      `Better Auth migrate: ${toBeCreated.length} table(s), ${toBeAdded.length} alteration(s)`,
    );
    await runMigrations();
    console.log("Better Auth schema migrated");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
