import {
  type ContextStore,
  createContextDbFromUrl,
  createContextStore,
  migrateContextSchema,
  resolveDatabaseUrl,
} from "@everyday/context";
import { createIngestQueue, type IngestQueue } from "@everyday/ingest";
import type { Pool } from "pg";

export type ContextHandle = {
  store: ContextStore;
  pool: Pool;
  close: () => Promise<void>;
};

let contextHandle: ContextHandle | null = null;
let queueHandle: IngestQueue | null = null;

export async function getContextStore(): Promise<ContextHandle> {
  if (!contextHandle) {
    const { pool, db } = await createContextDbFromUrl();
    contextHandle = {
      store: createContextStore(db),
      pool,
      close: async () => {
        await pool.end();
        contextHandle = null;
      },
    };
  }
  return contextHandle;
}

export async function getIngestQueue(): Promise<IngestQueue> {
  if (!queueHandle) {
    queueHandle = await createIngestQueue();
  }
  return queueHandle;
}

export async function ensureContextReady(connectionString?: string): Promise<void> {
  const databaseUrl = resolveDatabaseUrl(connectionString);
  await migrateContextSchema(databaseUrl);
}

export async function closeContextAndQueue(): Promise<void> {
  if (queueHandle) {
    await queueHandle.close();
    queueHandle = null;
  }
  if (contextHandle) {
    await contextHandle.close();
    contextHandle = null;
  }
}
