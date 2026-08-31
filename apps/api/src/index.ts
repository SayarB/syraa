import "dotenv/config";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closeHarness, createHarnessServer, ensureHarnessReady } from "@syraa/harness";

const port = Number(process.env.PORT ?? 3000);
const here = dirname(fileURLToPath(import.meta.url));

/** Optional static UI dir (e.g. apps/web/dist in Docker). Empty = API only. */
function resolveStaticDir(): string | undefined {
  const fromEnv = process.env.STATIC_DIR?.trim();
  if (fromEnv) {
    const abs = resolve(fromEnv);
    if (!existsSync(abs)) {
      throw new Error(`STATIC_DIR does not exist: ${abs}`);
    }
    return abs;
  }
  const webDist = resolve(here, "../../../apps/web/dist");
  if (existsSync(webDist)) return webDist;
  return undefined;
}

async function main(): Promise<void> {
  await ensureHarnessReady();
  console.log("memory schema ready");

  const staticDir = resolveStaticDir();
  const server = createHarnessServer({ staticDir });
  server.listen(port, () => {
    if (staticDir) {
      console.log(`Syraa API + UI → http://localhost:${port} (static: ${staticDir})`);
    } else {
      console.log(`Syraa API → http://localhost:${port} (no static UI; use apps/web)`);
    }
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
