import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  Confidence,
  CreatedBy,
  ItemSource,
  ItemStatus,
  ItemType,
  MemoryScope,
} from "../models.js";

export const memories = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id").notNull(),
    scope: text("scope").$type<MemoryScope>().notNull(),
    kindId: text("kind_id"),
    subprojectId: text("subproject_id"),
    scopeKey: text("scope_key").notNull(),
    brief: text("brief"),
    openLoops: jsonb("open_loops").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (t) => [
    uniqueIndex("memories_user_scope_key").on(t.userId, t.scopeKey),
    index("idx_memories_user").on(t.userId),
  ],
);

export const memoryItems = pgTable(
  "memory_items",
  {
    id: uuid("id").primaryKey(),
    memoryId: uuid("memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    type: text("type").$type<ItemType>().notNull(),
    text: text("text").notNull(),
    status: text("status").$type<ItemStatus>().notNull().default("active"),
    source: text("source").$type<ItemSource>().notNull().default("explicit"),
    confidence: text("confidence").$type<Confidence>().notNull().default("medium"),
    needsConfirm: boolean("needs_confirm").notNull().default(false),
    priority: integer("priority").notNull().default(0),
    tags: jsonb("tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    why: text("why"),
    evidenceSessionId: text("evidence_session_id"),
    evidenceMessageIds: jsonb("evidence_message_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    evidenceArtifactKey: text("evidence_artifact_key"),
    factResourceId: text("fact_resource_id"),
    factPath: text("fact_path"),
    supersedesId: uuid("supersedes_id"),
    forkedFromId: uuid("forked_from_id"),
    createdBy: text("created_by").$type<CreatedBy>().notNull().default("user"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true, mode: "string" }),
    confirmedBy: text("confirmed_by"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (t) => [
    index("idx_items_memory").on(t.memoryId),
    index("idx_items_status").on(t.memoryId, t.status),
  ],
);

export type MemoryRow = typeof memories.$inferSelect;
export type MemoryItemRow = typeof memoryItems.$inferSelect;
