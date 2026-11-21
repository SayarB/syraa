import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { createGuardrailDbFromUrl, type GuardrailDb } from "./db/client.js";
import { guardrailVerdicts, type VerdictRow } from "./db/schema.js";
import type { VerdictState } from "./guard.js";

export type NewVerdict = {
  guard: string;
  subjectKind: "message" | "document";
  subjectId: string | null;
  userId: string;
  threadId: string | null;
  state: VerdictState;
  categories: string[];
  answers: Record<string, number | string> | null;
  model: string | null;
  error: string | null;
  /** Flagged messages only; the database rejects text on any other state. */
  subjectText: string | null;
};

export type ListFlaggedQuery = {
  guard?: string;
  userId?: string;
  /** ISO timestamp; only rows created at or after it. */
  since?: string;
  limit?: number;
};

export type GuardrailRepository = {
  record(row: NewVerdict): Promise<void>;
  listFlagged(query?: ListFlaggedQuery): Promise<VerdictRow[]>;
  /** Retention. Deletes verdict rows only; never touches any other table. */
  purgeOlderThan(days: number): Promise<number>;
};

export function createGuardrailRepository(db: GuardrailDb): GuardrailRepository {
  return {
    async record(row) {
      await db.insert(guardrailVerdicts).values({
        id: randomUUID(),
        ...row,
        createdAt: new Date().toISOString(),
      });
    },

    async listFlagged(query = {}) {
      const conditions = [eq(guardrailVerdicts.state, "flagged")];
      if (query.guard) conditions.push(eq(guardrailVerdicts.guard, query.guard));
      if (query.userId) conditions.push(eq(guardrailVerdicts.userId, query.userId));
      if (query.since) conditions.push(gte(guardrailVerdicts.createdAt, query.since));
      return db
        .select()
        .from(guardrailVerdicts)
        .where(and(...conditions))
        .orderBy(desc(guardrailVerdicts.createdAt))
        .limit(query.limit ?? 100);
    },

    async purgeOlderThan(days) {
      const deleted = await db
        .delete(guardrailVerdicts)
        .where(lt(guardrailVerdicts.createdAt, sql`now() - make_interval(days => ${days})`))
        .returning({ id: guardrailVerdicts.id });
      return deleted.length;
    },
  };
}

export type GuardrailHandle = {
  repository: GuardrailRepository;
  close: () => Promise<void>;
};

export async function createGuardrailRepositoryFromUrl(
  connectionString?: string,
): Promise<GuardrailHandle> {
  const { pool, db } = await createGuardrailDbFromUrl(connectionString);
  return { repository: createGuardrailRepository(db), close: () => pool.end() };
}
