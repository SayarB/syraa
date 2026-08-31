import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { migrateMemorySchema } from "../src/db/client.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
config({ path: resolve(repoRoot, ".env") });

export default async function globalSetup(): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  await migrateMemorySchema(process.env.DATABASE_URL);
}
