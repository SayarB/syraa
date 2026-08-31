import "dotenv/config";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { closeHarness, createHarnessServer, ensureHarnessReady } from "@everyday/harness";

const port = Number(process.env.PORT ?? 3000);
const staticDir = join(dirname(fileURLToPath(import.meta.url)), "../public");

async function main(): Promise<void> {
  await ensureHarnessReady();
  console.log("memory schema ready");

  const server = createHarnessServer({ staticDir });
  server.listen(port, () => {
    console.log(`Everyday chat UI → http://localhost:${port}`);
  });

  async function shutdown(): Promise<void> {
    server.close();
    await closeHarness();
    process.exit(0);
  }

  process.on("SIGINT", () => {
    shutdown().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  });

  process.on("SIGTERM", () => {
    shutdown().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
