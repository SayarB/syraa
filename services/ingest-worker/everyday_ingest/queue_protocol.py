"""Redis list queue protocol — must match @everyday/ingest.

Queue key: everyday:ingest:queue (LPUSH / BRPOP)
Status hash: everyday:ingest:job:{jobId}
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

QUEUE_KEY = "everyday:ingest:queue"


def job_key(job_id: str) -> str:
    return f"everyday:ingest:job:{job_id}"


@dataclass
class IngestJob:
    job_id: str
    user_id: str
    resource_id: str
    drive_key: str
    file_path: str
    mime: str
    name: str

    @classmethod
    def from_json(cls, raw: str | bytes) -> IngestJob:
        data = json.loads(raw)
        required = (
            "jobId",
            "userId",
            "resourceId",
            "driveKey",
            "filePath",
            "mime",
            "name",
        )
        missing = [k for k in required if not data.get(k)]
        if missing:
            raise ValueError(f"invalid ingest job payload; missing {missing}")
        return cls(
            job_id=data["jobId"],
            user_id=data["userId"],
            resource_id=data["resourceId"],
            drive_key=data["driveKey"],
            file_path=data["filePath"],
            mime=data["mime"],
            name=data["name"],
        )


def status_fields(
    *,
    status: str,
    user_id: str | None = None,
    resource_id: str | None = None,
    name: str | None = None,
    mime: str | None = None,
    error: str | None = None,
    topic_count: int | None = None,
    chunk_count: int | None = None,
    bridge_count: int | None = None,
    leaf_count: int | None = None,
    embedding_provider: str | None = None,
    updated_at: str,
) -> dict[str, str]:
    fields: dict[str, str] = {"status": status, "updatedAt": updated_at}
    if user_id is not None:
        fields["userId"] = user_id
    if resource_id is not None:
        fields["resourceId"] = resource_id
    if name is not None:
        fields["name"] = name
    if mime is not None:
        fields["mime"] = mime
    if error is not None:
        fields["error"] = error
    if topic_count is not None:
        fields["topicCount"] = str(topic_count)
    if chunk_count is not None:
        fields["chunkCount"] = str(chunk_count)
    if bridge_count is not None:
        fields["bridgeCount"] = str(bridge_count)
    if leaf_count is not None:
        fields["leafCount"] = str(leaf_count)
    if embedding_provider is not None:
        fields["embeddingProvider"] = embedding_provider
    return fields


def as_mapping(fields: dict[str, Any]) -> dict[str, str]:
    return {k: str(v) for k, v in fields.items()}
