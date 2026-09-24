"""Embedding helpers — OpenAI-compatible HTTP, or null when unconfigured."""

from __future__ import annotations

import hashlib
import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from typing import Any


def _env(name: str, default: str = "") -> str:
    """Env var, or ``default`` when unset or blank (compose passes ``${X:-}`` as "")."""
    return (os.environ.get(name) or "").strip() or default


DEFAULT_HASH_DIMS = 64
MAX_HASH_DIMS = 4096
# Remote-failure stubs always use this size, not EMBEDDING_DIMS, so they never take the size of
# the configured model's vectors and search's dimension filter keeps them out.
FALLBACK_DIMS = 64
_warned_dims: set[str] = set()


def _dims() -> int:
    """EMBEDDING_DIMS for the hash provider; a missing or bad value means the default (never raises)."""
    raw = _env("EMBEDDING_DIMS", str(DEFAULT_HASH_DIMS))
    try:
        dims = int(raw)
    except ValueError:
        dims = 0
    if 0 < dims <= MAX_HASH_DIMS:
        return dims
    if raw not in _warned_dims:  # log a bad setting once, not on every job
        _warned_dims.add(raw)
        print(
            f"EMBEDDING_DIMS={raw!r} is not 1..{MAX_HASH_DIMS}; using {DEFAULT_HASH_DIMS}",
            file=sys.stderr,
            flush=True,
        )
    return DEFAULT_HASH_DIMS


def resolve_embedding_config() -> dict[str, Any]:
    provider = _env("EMBEDDING_PROVIDER", "auto").lower()
    if provider in ("none", "off", "null"):
        return {"provider": "none", "model": None, "base_url": None, "api_key": None}

    fireworks_key = _env("FIREWORKS_API_KEY")
    openai_key = _env("OPENAI_API_KEY")

    if provider == "auto":
        if fireworks_key:
            provider = "fireworks"
        elif openai_key:
            provider = "openai"
        else:
            return {"provider": "none", "model": None, "base_url": None, "api_key": None}

    if provider == "fireworks":
        return {
            "provider": "fireworks",
            "model": _env("EMBEDDING_MODEL", "nomic-ai/nomic-embed-text-v1.5"),
            "base_url": _env(
                "EMBEDDING_BASE_URL",
                "https://api.fireworks.ai/inference/v1",
            ).rstrip("/"),
            "api_key": fireworks_key or _env("EMBEDDING_API_KEY"),
        }

    if provider == "openai":
        return {
            "provider": "openai",
            "model": _env("EMBEDDING_MODEL", "text-embedding-3-small"),
            "base_url": _env("EMBEDDING_BASE_URL", "https://api.openai.com/v1").rstrip("/"),
            "api_key": openai_key or _env("EMBEDDING_API_KEY"),
        }

    if provider == "hash":
        # Deterministic local stub for tests / offline MVP (not semantic).
        dims = _dims()
        return {"provider": "hash", "model": f"hash-{dims}", "base_url": None, "api_key": None}

    raise ValueError(f"unknown EMBEDDING_PROVIDER={provider}")


def _ssl_context() -> ssl.SSLContext:
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:  # noqa: BLE001 — fall back to system store
        return ssl.create_default_context()


def _hash_embedding(text: str, dims: int) -> list[float]:
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    values: list[float] = []
    seed = digest
    while len(values) < dims:
        for b in seed:
            values.append((b / 255.0) * 2.0 - 1.0)
            if len(values) >= dims:
                break
        seed = hashlib.sha256(seed).digest()
    # L2 normalize
    norm = sum(v * v for v in values) ** 0.5 or 1.0
    return [v / norm for v in values]


def _openai_compatible_embed(
    texts: list[str],
    *,
    base_url: str,
    api_key: str,
    model: str,
) -> list[list[float]]:
    if not api_key:
        raise RuntimeError("embedding API key is empty")
    body = json.dumps({"model": model, "input": texts}).encode("utf-8")
    req = urllib.request.Request(
        f"{base_url}/embeddings",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60, context=_ssl_context()) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"embedding HTTP {err.code}: {detail}") from err

    data = payload.get("data") or []
    data_sorted = sorted(data, key=lambda row: int(row.get("index", 0)))
    if len(data_sorted) != len(texts):
        raise RuntimeError("embedding response size mismatch")
    return [list(row["embedding"]) for row in data_sorted]


def embed_texts(texts: list[str]) -> tuple[list[list[float] | None], str]:
    """Return (embeddings, provider_name). Missing provider → all None.

    On remote embedding SSL/network failure, falls back to local hash vectors so
    ingest can still persist the topic tree.
    """
    if not texts:
        return [], "none"

    cfg = resolve_embedding_config()
    provider = cfg["provider"]

    if provider == "none":
        return [None for _ in texts], "none"

    if provider == "hash":
        return [_hash_embedding(t, _dims()) for t in texts], "hash"

    try:
        vectors = _openai_compatible_embed(
            texts,
            base_url=str(cfg["base_url"]),
            api_key=str(cfg["api_key"]),
            model=str(cfg["model"]),
        )
        return vectors, provider
    except Exception as err:  # noqa: BLE001 — keep ingest moving
        dims = FALLBACK_DIMS
        print(
            f"embedding via {provider} failed ({err}); falling back to hash-{dims}",
            flush=True,
        )
        return [_hash_embedding(t, dims) for t in texts], f"hash-fallback:{provider}"
