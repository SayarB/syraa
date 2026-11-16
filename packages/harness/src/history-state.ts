import { type CompactionState, parseCompactionState } from "@syraa/history";
import type { Pool } from "pg";
import { ensureTable, getHarnessPool } from "./db.js";

/**
 * Summaries of a thread's older turns (see @syraa/history), one row per thread. A table of its own,
 * not thread metadata: Mastra loads every thread's metadata when listing threads, and a summary
 * state is several kilobytes.
 */
const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS thread_history_summaries (
    thread_id text PRIMARY KEY,
    user_id text NOT NULL,
    state jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )
`;

/** Create the table if missing (idempotent; runs at boot). */
export async function ensureHistoryReady(connectionString?: string): Promise<void> {
  await ensureTable(CREATE_TABLE, connectionString);
}

export type CompactionStateStore = {
  load(userId: string, threadId: string): Promise<CompactionState | null>;
  /**
   * Writes `state` only if the stored revision is still `expectedRev` (0 when nothing is stored)
   * and the thread still exists. Returns false when it did not write, so a job that lost a race
   * or outlived its thread stops instead of overwriting.
   */
  save(
    userId: string,
    threadId: string,
    state: CompactionState,
    expectedRev: number,
  ): Promise<boolean>;
  remove(threadId: string): Promise<void>;
};

export function createCompactionStateStore(
  getPool: () => Pick<Pool, "query"> = getHarnessPool,
): CompactionStateStore {
  return {
    async load(userId, threadId) {
      const result = await getPool().query<{ state: unknown }>(
        "SELECT state FROM thread_history_summaries WHERE thread_id = $1 AND user_id = $2",
        [threadId, userId],
      );
      return parseCompactionState(result.rows[0]?.state);
    },

    async save(userId, threadId, state, expectedRev) {
      const result = await getPool().query(
        `INSERT INTO thread_history_summaries (thread_id, user_id, state, updated_at)
         SELECT $1::text, $2::text, $3::jsonb, now()
          WHERE EXISTS (SELECT 1 FROM mastra_threads WHERE id = $1::text AND "resourceId" = $2::text)
         ON CONFLICT (thread_id) DO UPDATE
            SET state = EXCLUDED.state, updated_at = now()
          WHERE thread_history_summaries.user_id = $2::text
            AND (thread_history_summaries.state->>'rev')::int = $4::int
         RETURNING thread_id`,
        [threadId, userId, JSON.stringify(state), expectedRev],
      );
      return (result.rowCount ?? 0) === 1;
    },

    async remove(threadId) {
      await getPool().query("DELETE FROM thread_history_summaries WHERE thread_id = $1", [
        threadId,
      ]);
    },
  };
}

let store: CompactionStateStore | null = null;

export function getCompactionStateStore(): CompactionStateStore {
  store ??= createCompactionStateStore();
  return store;
}
