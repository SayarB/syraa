import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { ChunkRole, ResourceStatus, TopicSource, TopicStatus } from "../models.js";

export const contextResources = pgTable(
  "context_resources",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id").notNull(),
    driveKey: text("drive_key").notNull(),
    path: text("path").notNull(),
    name: text("name").notNull(),
    ext: text("ext"),
    mime: text("mime"),
    sizeBytes: integer("size_bytes"),
    contentHash: text("content_hash"),
    kindId: text("kind_id"),
    subprojectId: text("subproject_id"),
    tags: jsonb("tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    status: text("status").$type<ResourceStatus>().notNull().default("pending_ingest"),
    ingestError: text("ingest_error"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true, mode: "string" }),
  },
  (t) => [
    uniqueIndex("context_resources_user_drive_key").on(t.userId, t.driveKey),
    index("idx_context_resources_user").on(t.userId),
    index("idx_context_resources_status").on(t.userId, t.status),
  ],
);

export const contextTopics = pgTable(
  "context_topics",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id").notNull(),
    resourceId: uuid("resource_id").references(() => contextResources.id, { onDelete: "cascade" }),
    subprojectId: text("subproject_id"),
    parentId: uuid("parent_id"),
    path: text("path").notNull(),
    ordinal: integer("ordinal").notNull().default(0),
    title: text("title").notNull(),
    summary: text("summary"),
    depth: integer("depth").notNull().default(0),
    relatedTopicIds: jsonb("related_topic_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    embedding: jsonb("embedding").$type<number[] | null>(),
    source: text("source").$type<TopicSource>().notNull().default("extracted"),
    status: text("status").$type<TopicStatus>().notNull().default("active"),
    mergedFromIds: jsonb("merged_from_ids").$type<string[] | null>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (t) => [
    index("idx_context_topics_resource").on(t.resourceId),
    index("idx_context_topics_user").on(t.userId),
    index("idx_context_topics_parent").on(t.parentId),
  ],
);

export const contextChunks = pgTable(
  "context_chunks",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id").notNull(),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => contextResources.id, { onDelete: "cascade" }),
    parentTopicId: uuid("parent_topic_id")
      .notNull()
      .references(() => contextTopics.id, { onDelete: "cascade" }),
    childTopicId: uuid("child_topic_id").references(() => contextTopics.id, {
      onDelete: "set null",
    }),
    role: text("role").$type<ChunkRole>().notNull(),
    ordinal: integer("ordinal").notNull().default(0),
    text: text("text").notNull(),
    tokenEstimate: integer("token_estimate").notNull().default(0),
    anchor: jsonb("anchor").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    embedding: jsonb("embedding").$type<number[] | null>(),
    contentHash: text("content_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (t) => [
    index("idx_context_chunks_resource").on(t.resourceId),
    index("idx_context_chunks_parent_topic").on(t.parentTopicId),
    index("idx_context_chunks_user").on(t.userId),
  ],
);

export const contextCards = pgTable(
  "context_cards",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id").notNull(),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => contextResources.id, { onDelete: "cascade" }),
    cardType: text("card_type").notNull().default("generic"),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    outline: jsonb("outline").notNull().default(sql`'[]'::jsonb`),
    entities: jsonb("entities").notNull().default(sql`'{}'::jsonb`),
    constraints: jsonb("constraints").notNull().default(sql`'{}'::jsonb`),
    projection: text("projection"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (t) => [
    uniqueIndex("context_cards_resource").on(t.resourceId),
    index("idx_context_cards_user").on(t.userId),
  ],
);

export type ContextResourceRow = typeof contextResources.$inferSelect;
export type ContextTopicRow = typeof contextTopics.$inferSelect;
export type ContextChunkRow = typeof contextChunks.$inferSelect;
export type ContextCardRow = typeof contextCards.$inferSelect;
