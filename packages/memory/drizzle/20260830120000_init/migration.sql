CREATE TABLE IF NOT EXISTS "memories" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "scope" text NOT NULL,
  "kind_id" text,
  "subproject_id" text,
  "scope_key" text NOT NULL,
  "brief" text,
  "open_loops" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "memories_scope_check" CHECK ("scope" IN ('user', 'kind', 'subproject'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "memories_user_scope_key" ON "memories" ("user_id", "scope_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_memories_user" ON "memories" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "memory_items" (
  "id" uuid PRIMARY KEY NOT NULL,
  "memory_id" uuid NOT NULL,
  "type" text NOT NULL,
  "text" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "source" text DEFAULT 'explicit' NOT NULL,
  "confidence" text DEFAULT 'medium' NOT NULL,
  "needs_confirm" boolean DEFAULT false NOT NULL,
  "priority" integer DEFAULT 0 NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "why" text,
  "evidence_session_id" text,
  "evidence_message_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "evidence_artifact_key" text,
  "fact_resource_id" text,
  "fact_path" text,
  "supersedes_id" uuid,
  "forked_from_id" uuid,
  "created_by" text DEFAULT 'user' NOT NULL,
  "confirmed_at" timestamptz,
  "confirmed_by" text,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "memory_items_type_check" CHECK ("type" IN ('preference', 'rule', 'method', 'decision', 'fact_ref')),
  CONSTRAINT "memory_items_status_check" CHECK ("status" IN ('pending', 'active', 'superseded', 'dismissed', 'deleted')),
  CONSTRAINT "memory_items_source_check" CHECK ("source" IN ('explicit', 'distilled', 'promoted', 'forked')),
  CONSTRAINT "memory_items_confidence_check" CHECK ("confidence" IN ('high', 'medium', 'low')),
  CONSTRAINT "memory_items_created_by_check" CHECK ("created_by" IN ('user', 'system'))
);
--> statement-breakpoint
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "memories"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_items_memory" ON "memory_items" ("memory_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_items_status" ON "memory_items" ("memory_id", "status");
