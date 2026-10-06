/**
 * Retitle existing threads with the title model (see `backfillThreadTitles`).
 *
 *   npm run titles:backfill -w @syraa/harness -- [--dry-run] [--user <userId>]
 *
 * Safe to re-run: threads that already have a generated or user-set title are skipped.
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  // Imported after .env is loaded: model and storage config read env at first use.
  const { backfillThreadTitles } = await import("./thread-titles.js");
  const { closeHarness } = await import("./chat.js");

  const dryRun = process.argv.includes("--dry-run");
  const userId = argValue("--user");
  try {
    const result = await backfillThreadTitles({ userId, dryRun, log: (line) => console.log(line) });
    console.log(
      `${dryRun ? "[dry run] " : ""}scanned ${result.scanned}, retitled ${result.retitled}, ` +
        `skipped ${result.skipped}, failed ${result.failed}`,
    );
    if (result.failed > 0) process.exitCode = 1;
  } finally {
    await closeHarness();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
