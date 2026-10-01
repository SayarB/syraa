"""Langfuse tracing for ingest jobs.

Off unless LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are set (LANGFUSE_BASE_URL points at the
self-hosted instance). With tracing off every observation is ``None`` and callers carry on.

One trace per ingest job (``ingest-document``); parsing, embedding and persisting nest under it.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any


def _client():
    public_key = os.environ.get("LANGFUSE_PUBLIC_KEY", "").strip()
    secret_key = os.environ.get("LANGFUSE_SECRET_KEY", "").strip()
    if not public_key or not secret_key:
        return None

    os.environ.setdefault("LANGFUSE_TRACING_ENVIRONMENT", "development")
    from langfuse import get_client

    return get_client()


@contextmanager
def observe(name: str, *, as_type: str = "span", **fields: Any) -> Iterator[Any | None]:
    """A Langfuse observation nested under the current one; ``None`` when tracing is off."""
    client = _client()
    if client is None:
        yield None
        return

    with client.start_as_current_observation(name=name, as_type=as_type, **fields) as observation:
        yield observation


@contextmanager
def trace_ingest_job(
    *, user_id: str, input: dict[str, Any], metadata: dict[str, Any]
) -> Iterator[Any | None]:
    """Root ``ingest-document`` trace for one job; flushed when the job ends."""
    client = _client()
    if client is None:
        yield None
        return

    from langfuse import propagate_attributes

    try:
        with (
            client.start_as_current_observation(
                name="ingest-document", as_type="span", input=input, metadata=metadata
            ) as root,
            propagate_attributes(user_id=user_id, trace_name="ingest-document", tags=["ingest"]),
        ):
            yield root
    finally:
        client.flush()
