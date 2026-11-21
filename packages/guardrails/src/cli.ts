import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { config as loadEnv } from "dotenv";
import { createGuardrailRepositoryFromUrl } from "./repository.js";

loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

/** CLI output (the product of this command), not a log line. */
function print(line: string): void {
  process.stdout.write(`${line}\n`);
}

/** `npm run flags -w @syraa/guardrails -- [--guard message|document] [--user <id>] [--since <iso>]` */
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      guard: { type: "string" },
      user: { type: "string" },
      since: { type: "string" },
      limit: { type: "string" },
    },
  });

  const handle = await createGuardrailRepositoryFromUrl();
  try {
    const rows = await handle.repository.listFlagged({
      guard: values.guard,
      userId: values.user,
      since: values.since,
      limit: values.limit ? Number(values.limit) : undefined,
    });
    if (rows.length === 0) {
      print("no flagged verdicts");
      return;
    }
    for (const row of rows) {
      print(
        `${row.createdAt}  ${row.guard}  user=${row.userId}  thread=${row.threadId ?? "-"}  [${row.categories.join(", ")}]  id=${row.id}`,
      );
      if (row.subjectText) print(`  ${row.subjectText}`);
    }
  } finally {
    await handle.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
