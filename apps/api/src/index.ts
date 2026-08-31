import "dotenv/config";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closeHarness, createHarnessServer, ensureHarnessReady } from "@syraa/harness";

const port = Number(process.env.PORT ?? 3000);
const here = dirname(fileURLToPath(import.meta.url));

/**
 * Docker/OrbStack often hangs on Fireworks AAAA (ETIMEDOUT) even with
 * --dns-result-order=ipv4first. Force undici connect family 4.
 */
async function preferIpv4Outbound(): Promise<void> {
  const flag = process.env.FORCE_IPV4?.trim().toLowerCase();
  const enabled =
    flag === "1" ||
    flag === "true" ||
    (process.env.NODE_OPTIONS?.includes("dns-result-order=ipv4first") ?? false);
  if (!enabled) return;

  try {
    const { Agent, setGlobalDispatcher } = await import("undici");
    setGlobalDispatcher(new Agent({ connect: { family: 4 } }));
    console.log("outbound HTTP forced to IPv4 (FORCE_IPV4 / ipv4first)");
  } catch (err) {
    console.warn("could not force IPv4 outbound:", err);
  }
}

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
  await preferIpv4Outbound();
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
