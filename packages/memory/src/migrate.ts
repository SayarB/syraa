import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { migrateMemorySchema, resolveDatabaseUrl } from "./db/client.js";

loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

async function main(): Promise<void> {
  const url = resolveDatabaseUrl(process.argv[2]);
  await migrateMemorySchema(url);
  console.log("memory schema migrated");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
