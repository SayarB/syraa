import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { migrateGuardrailsSchema, resolveDatabaseUrl } from "./db/client.js";

loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

async function main(): Promise<void> {
  await migrateGuardrailsSchema(resolveDatabaseUrl(process.argv[2]));
  console.log("guardrails schema migrated");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
