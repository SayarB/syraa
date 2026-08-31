CREATE TABLE IF NOT EXISTS "context_resources" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "drive_key" text NOT NULL,
  "path" text NOT NULL,
  "name" text NOT NULL,
  "ext" text,
  "mime" text,
  "size_bytes" integer,
  "content_hash" text,
  "kind_id" text,
  "subproject_id" text,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'pending_ingest' NOT NULL,
  "ingest_error" text,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  "ingested_at" timestamptz,
  CONSTRAINT "context_resources_status_check" CHECK ("status" IN ('pending_ingest', 'ready', 'failed', 'deleted'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "context_resources_user_drive_key" ON "context_resources" ("user_id", "drive_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_context_resources_user" ON "context_resources" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_context_resources_status" ON "context_resources" ("user_id", "status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "context_topics" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "resource_id" uuid,
  "subproject_id" text,
  "parent_id" uuid,
  "path" text NOT NULL,
  "ordinal" integer DEFAULT 0 NOT NULL,
  "title" text NOT NULL,
  "summary" text,
  "depth" integer DEFAULT 0 NOT NULL,
  "related_topic_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "embedding" jsonb,
  "source" text DEFAULT 'extracted' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "merged_from_ids" jsonb,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "context_topics_source_check" CHECK ("source" IN ('extracted', 'merged', 'user_edited')),
  CONSTRAINT "context_topics_status_check" CHECK ("status" IN ('active', 'superseded', 'deleted'))
);
--> statement-breakpoint
ALTER TABLE "context_topics" ADD CONSTRAINT "context_topics_resource_id_context_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "context_resources"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_context_topics_resource" ON "context_topics" ("resource_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_context_topics_user" ON "context_topics" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_context_topics_parent" ON "context_topics" ("parent_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "context_chunks" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "resource_id" uuid NOT NULL,
  "parent_topic_id" uuid NOT NULL,
  "child_topic_id" uuid,
  "role" text NOT NULL,
  "ordinal" integer DEFAULT 0 NOT NULL,
  "text" text NOT NULL,
  "token_estimate" integer DEFAULT 0 NOT NULL,
  "anchor" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "embedding" jsonb,
  "content_hash" text NOT NULL,
  "created_at" timestamptz NOT NULL,
  CONSTRAINT "context_chunks_role_check" CHECK ("role" IN ('bridge', 'leaf'))
);
--> statement-breakpoint
ALTER TABLE "context_chunks" ADD CONSTRAINT "context_chunks_resource_id_context_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "context_resources"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "context_chunks" ADD CONSTRAINT "context_chunks_parent_topic_id_context_topics_id_fk" FOREIGN KEY ("parent_topic_id") REFERENCES "context_topics"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "context_chunks" ADD CONSTRAINT "context_chunks_child_topic_id_context_topics_id_fk" FOREIGN KEY ("child_topic_id") REFERENCES "context_topics"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_context_chunks_resource" ON "context_chunks" ("resource_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_context_chunks_parent_topic" ON "context_chunks" ("parent_topic_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_context_chunks_user" ON "context_chunks" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "context_cards" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "resource_id" uuid NOT NULL,
  "card_type" text DEFAULT 'generic' NOT NULL,
  "title" text NOT NULL,
  "summary" text NOT NULL,
  "outline" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "entities" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "constraints" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "projection" text,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);
--> statement-breakpoint
ALTER TABLE "context_cards" ADD CONSTRAINT "context_cards_resource_id_context_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "context_resources"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "context_cards_resource" ON "context_cards" ("resource_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_context_cards_user" ON "context_cards" ("user_id");
