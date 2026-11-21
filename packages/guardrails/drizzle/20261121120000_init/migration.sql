CREATE TABLE IF NOT EXISTS "guardrail_verdicts" (
  "id" uuid PRIMARY KEY NOT NULL,
  "guard" text NOT NULL,
  "subject_kind" text NOT NULL,
  "subject_id" text,
  "user_id" text NOT NULL,
  "thread_id" text,
  "state" text NOT NULL,
  "categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "answers" jsonb,
  "model" text,
  "error" text,
  "subject_text" text,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "guardrail_verdicts_state_check" CHECK ("state" IN ('clean','flagged','unchecked')),
  CONSTRAINT "guardrail_verdicts_text_only_flagged" CHECK ("subject_text" IS NULL OR "state" = 'flagged')
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_guardrail_verdicts_user_created" ON "guardrail_verdicts" ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_guardrail_verdicts_state_created" ON "guardrail_verdicts" ("state", "created_at");
