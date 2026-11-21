import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * One row per guard run. No foreign keys: the package stays independent of the tables it
 * guards (`subject_id` is a plain message or resource id). Message text is kept only for
 * flagged rows (enforced by the CHECK) and never for documents.
 */
export const guardrailVerdicts = pgTable(
  "guardrail_verdicts",
  {
    id: uuid("id").primaryKey(),
    guard: text("guard").notNull(),
    subjectKind: text("subject_kind").notNull(),
    subjectId: text("subject_id"),
    userId: text("user_id").notNull(),
    threadId: text("thread_id"),
    state: text("state").notNull(),
    categories: jsonb("categories").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    answers: jsonb("answers").$type<Record<string, number | string>>(),
    model: text("model"),
    error: text("error"),
    subjectText: text("subject_text"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (t) => [
    index("idx_guardrail_verdicts_user_created").on(t.userId, t.createdAt),
    index("idx_guardrail_verdicts_state_created").on(t.state, t.createdAt),
    check("guardrail_verdicts_state_check", sql`${t.state} IN ('clean','flagged','unchecked')`),
    check(
      "guardrail_verdicts_text_only_flagged",
      sql`${t.subjectText} IS NULL OR ${t.state} = 'flagged'`,
    ),
  ],
);

export type VerdictRow = typeof guardrailVerdicts.$inferSelect;
