"""Persist ingest pipeline output into context_* tables."""

from __future__ import annotations

import hashlib
import json
import os
import uuid
from datetime import UTC, datetime
from typing import Any

import psycopg

# DB TopicSource: extracted | merged | user_edited
# Pipeline structure methods (bookmarks/toc/heuristics) all map to "extracted".
_TOPIC_SOURCES = frozenset({"extracted", "merged", "user_edited"})
_STRUCTURE_TO_TOPIC_SOURCE = {
    "bookmarks": "extracted",
    "toc": "extracted",
    "heuristics": "extracted",
    "extracted": "extracted",
    "merged": "merged",
    "user_edited": "user_edited",
}


def _topic_source(raw: object) -> str:
    value = str(raw or "extracted").strip().lower()
    mapped = _STRUCTURE_TO_TOPIC_SOURCE.get(value, "extracted")
    return mapped if mapped in _TOPIC_SOURCES else "extracted"


def _utc_now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def resolve_database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is required for ingest persistence")
    return url


def persist_ingest_result(
    *,
    user_id: str,
    resource_id: str,
    artifact: dict[str, Any],
    embeddings: list[list[float] | None],
) -> None:
    topics = artifact["topics"]
    chunks = artifact["chunks"]
    card = artifact["card"]
    resource_meta = artifact["resource"]
    now = _utc_now()

    if len(embeddings) != len(chunks):
        raise ValueError("embeddings length must match chunks")

    with (
        psycopg.connect(resolve_database_url()) as conn,
        conn.transaction(),
        conn.cursor() as cur,
    ):
        # Replace prior tree for this resource (re-ingest).
        cur.execute(
            "DELETE FROM context_chunks WHERE resource_id = %s AND user_id = %s",
            (resource_id, user_id),
        )
        cur.execute(
            "DELETE FROM context_topics WHERE resource_id = %s AND user_id = %s",
            (resource_id, user_id),
        )
        cur.execute(
            "DELETE FROM context_cards WHERE resource_id = %s AND user_id = %s",
            (resource_id, user_id),
        )

        for topic in topics:
            cur.execute(
                """
                        INSERT INTO context_topics (
                          id, user_id, resource_id, subproject_id, parent_id, path, ordinal,
                          title, summary, depth, related_topic_ids, embedding, source, status,
                          merged_from_ids, created_at, updated_at
                        ) VALUES (
                          %s, %s, %s, NULL, %s, %s, %s,
                          %s, NULL, %s, '[]'::jsonb, NULL, %s, 'active',
                          NULL, %s, %s
                        )
                        """,
                (
                    topic["id"],
                    user_id,
                    resource_id,
                    topic.get("parent_id"),
                    topic["path"],
                    int(topic.get("ordinal") or 0),
                    topic["title"],
                    int(topic.get("depth") or 0),
                    _topic_source(topic.get("source")),
                    now,
                    now,
                ),
            )

        for chunk, embedding in zip(chunks, embeddings, strict=True):
            anchor = chunk.get("anchor") or {}
            if chunk.get("page_start") is not None:
                anchor = {**anchor, "page_start": chunk.get("page_start")}
            if chunk.get("page_end") is not None:
                anchor = {**anchor, "page_end": chunk.get("page_end")}
            text = chunk["text"]
            cur.execute(
                """
                        INSERT INTO context_chunks (
                          id, user_id, resource_id, parent_topic_id, child_topic_id, role,
                          ordinal, text, token_estimate, anchor, embedding, content_hash, created_at
                        ) VALUES (
                          %s, %s, %s, %s, %s, %s,
                          %s, %s, %s, %s::jsonb, %s::jsonb, %s, %s
                        )
                        """,
                (
                    chunk["id"],
                    user_id,
                    resource_id,
                    chunk["parent_topic_id"],
                    chunk.get("child_topic_id"),
                    chunk["role"],
                    int(chunk.get("ordinal") or 0),
                    text,
                    int(chunk.get("token_estimate") or 0),
                    json.dumps(anchor),
                    json.dumps(embedding) if embedding is not None else None,
                    _content_hash(text),
                    now,
                ),
            )

        outline = card.get("outline") or []
        projection = card.get("summary") or ""
        cur.execute(
            """
                    INSERT INTO context_cards (
                      id, user_id, resource_id, card_type, title, summary, outline,
                      entities, constraints, projection, version, created_at, updated_at
                    ) VALUES (
                      %s, %s, %s, %s, %s, %s, %s::jsonb,
                      %s::jsonb, %s::jsonb, %s, %s, %s, %s
                    )
                    """,
            (
                str(uuid.uuid4()),
                user_id,
                resource_id,
                card.get("card_type") or "generic",
                card.get("title") or resource_meta.get("title") or "Document",
                card.get("summary") or "",
                json.dumps(outline),
                json.dumps(card.get("entities") or {}),
                json.dumps(card.get("constraints") or {}),
                projection,
                int(card.get("version") or 1),
                now,
                now,
            ),
        )

        cur.execute(
            """
                    UPDATE context_resources
                    SET status = 'ready',
                        ingest_error = NULL,
                        content_hash = %s,
                        updated_at = %s,
                        ingested_at = %s
                    WHERE id = %s AND user_id = %s
                    """,
            (
                resource_meta.get("content_hash"),
                now,
                now,
                resource_id,
                user_id,
            ),
        )


def mark_resource_failed(user_id: str, resource_id: str, error: str) -> None:
    now = _utc_now()
    with psycopg.connect(resolve_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE context_resources
                SET status = 'failed',
                    ingest_error = %s,
                    updated_at = %s
                WHERE id = %s AND user_id = %s
                """,
                (error[:2000], now, resource_id, user_id),
            )
        conn.commit()
