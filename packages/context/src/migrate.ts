import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { migrateContextSchema, resolveDatabaseUrl } from "./db/client.js";

// Prefer repo-root .env when migrate is run from the package workspace cwd.
loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

async function main(): Promise<void> {
  const url = resolveDatabaseUrl(process.argv[2]);
  await migrateContextSchema(url);
  console.log("context schema migrated");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
