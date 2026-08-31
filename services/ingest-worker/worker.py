"""Ingest worker — BRPOP Redis jobs, run PDF pipeline, persist to Postgres."""

from __future__ import annotations

import os
import sys
import time
import traceback
from datetime import UTC, datetime
from pathlib import Path

from everyday_ingest.embed import embed_texts
from everyday_ingest.persist import mark_resource_failed, persist_ingest_result
from everyday_ingest.pipeline import ingest_pdf
from everyday_ingest.queue_protocol import (
    QUEUE_KEY,
    IngestJob,
    job_key,
    status_fields,
)


def _redis_client():
    import redis

    url = os.environ.get("REDIS_URL", "redis://localhost:6379")
    # socket_timeout must be None (or > BRPOP timeout) or blocking pops raise
    # "Timeout reading from socket" on every idle poll.
    return redis.Redis.from_url(
        url,
        decode_responses=True,
        socket_connect_timeout=5,
        socket_timeout=None,
        health_check_interval=30,
        retry_on_timeout=True,
    )


def _utc_now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _set_status(r, job: IngestJob, **kwargs) -> None:
    fields = status_fields(
        user_id=job.user_id,
        resource_id=job.resource_id,
        name=job.name,
        mime=job.mime,
        updated_at=_utc_now(),
        **kwargs,
    )
    r.hset(job_key(job.job_id), mapping=fields)


def process_job(job: IngestJob) -> dict:
    pdf = Path(job.file_path)
    if not pdf.is_file():
        raise FileNotFoundError(f"upload not found: {pdf}")

    artifact = ingest_pdf(pdf)
    texts = [c["text"] for c in artifact["chunks"]]
    embeddings, provider = embed_texts(texts)
    persist_ingest_result(
        user_id=job.user_id,
        resource_id=job.resource_id,
        artifact=artifact,
        embeddings=embeddings,
    )
    meta = artifact["meta"]
    return {
        "topic_count": int(meta["topic_count"]),
        "chunk_count": int(meta["chunk_count"]),
        "bridge_count": int(meta["bridge_count"]),
        "leaf_count": int(meta["leaf_count"]),
        "embedding_provider": provider,
    }


def main() -> None:
    r = _redis_client()
    print(
        f"ingest-worker listening on {QUEUE_KEY} "
        f"(REDIS_URL={os.environ.get('REDIS_URL', 'redis://localhost:6379')})",
        flush=True,
    )

    while True:
        try:
            item = r.brpop(QUEUE_KEY, timeout=5)
        except Exception as err:  # noqa: BLE001 — keep worker alive
            print(f"redis brpop error: {err}", file=sys.stderr, flush=True)
            time.sleep(2)
            try:
                r = _redis_client()
            except Exception as reconnect_err:  # noqa: BLE001
                print(f"redis reconnect failed: {reconnect_err}", file=sys.stderr, flush=True)
            continue

        if not item:
            continue

        _queue, raw = item
        try:
            job = IngestJob.from_json(raw)
        except Exception as err:  # noqa: BLE001
            print(f"bad job payload: {err}", file=sys.stderr, flush=True)
            continue

        print(f"processing job={job.job_id} resource={job.resource_id} name={job.name}", flush=True)
        _set_status(r, job, status="processing")

        try:
            stats = process_job(job)
            _set_status(
                r,
                job,
                status="ready",
                topic_count=stats["topic_count"],
                chunk_count=stats["chunk_count"],
                bridge_count=stats["bridge_count"],
                leaf_count=stats["leaf_count"],
                embedding_provider=stats["embedding_provider"],
            )
            print(
                f"ready job={job.job_id} topics={stats['topic_count']} "
                f"chunks={stats['chunk_count']} embed={stats['embedding_provider']}",
                flush=True,
            )
        except Exception as err:  # noqa: BLE001
            message = str(err)
            print(f"failed job={job.job_id}: {message}", file=sys.stderr, flush=True)
            traceback.print_exc()
            try:
                mark_resource_failed(job.user_id, job.resource_id, message)
            except Exception as persist_err:  # noqa: BLE001
                print(f"could not mark resource failed: {persist_err}", file=sys.stderr, flush=True)
            _set_status(r, job, status="failed", error=message[:2000])


if __name__ == "__main__":
    main()
