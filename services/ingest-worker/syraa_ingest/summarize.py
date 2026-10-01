"""Document summaries for the chat prompt — one short AI summary per document, made at ingest.

The chat prompt lists every document by name + this summary instead of every section title.
Input is bounded (cleaned top-level headings + the first body text), so a summary costs a few
thousand tokens once per upload. Never raises: no summary just means the prompt falls back to
a few headings.
"""

from __future__ import annotations

import json
import re
import sys
import urllib.error
import urllib.request
from typing import Any

from syraa_ingest.embed import MAX_ERROR_BODY_BYTES, _env, _ssl_context
from syraa_ingest.tracing import observe

MAX_HEADINGS = 80
MAX_HEADING_CHARS = 3000
MAX_BODY_CHARS = 8000
MIN_BODY_CHARS = 400
MAX_SUMMARY_CHARS = 600
REQUEST_TIMEOUT_S = 60

SYSTEM_PROMPT = (
    "You summarise documents for an assistant's context. Write 2-4 plain sentences on what the "
    "document is, its scope and purpose, then one line 'Key topics: a, b, c' (3-6 topics). "
    "Use only the provided headings and text. If the text is unclear, say what kind of document "
    "it appears to be and nothing more. No preamble."
)

PROVIDERS = {
    "fireworks": {
        "model": "accounts/fireworks/models/gpt-oss-120b",
        "base_url": "https://api.fireworks.ai/inference/v1",
        "key_env": "FIREWORKS_API_KEY",
        "model_env": "FIREWORKS_MODEL",
        "base_url_env": "FIREWORKS_BASE_URL",
    },
    "openai": {
        "model": "gpt-4o-mini",
        "base_url": "https://api.openai.com/v1",
        "key_env": "OPENAI_API_KEY",
        "model_env": "OPENAI_MODEL",
        "base_url_env": "OPENAI_BASE_URL",
    },
}

# Text extracted from PDFs with legacy Hindi fonts comes out as Latin-1 soup ("£ÉÉ®iÉ BÉEÉ").
_MOJIBAKE = re.compile(r"[ÃÂ�]|É[®EÉ]")
_WORD = re.compile(r"[A-Za-zऀ-ॿ]{3,}")


def resolve_summary_model() -> dict[str, str] | None:
    """Same provider/model choice as the API's chat model (CHAT_PROVIDER, *_MODEL, *_BASE_URL).

    SUMMARY_MODEL overrides the model only. None when no API key is configured.
    """
    provider = _env("CHAT_PROVIDER").lower()
    if provider not in PROVIDERS:
        provider = (
            "openai" if not _env("FIREWORKS_API_KEY") and _env("OPENAI_API_KEY") else "fireworks"
        )

    defaults = PROVIDERS[provider]
    api_key = _env(defaults["key_env"])
    if not api_key:
        return None

    return {
        "provider": provider,
        "api_key": api_key,
        "model": _env("SUMMARY_MODEL") or _env(defaults["model_env"], defaults["model"]),
        "base_url": _env(defaults["base_url_env"], defaults["base_url"]).rstrip("/"),
    }


def _is_clean(line: str) -> bool:
    """Readable text, not mojibake, page furniture or a stray number."""
    if _MOJIBAKE.search(line) or not _WORD.search(line):
        return False
    visible = [ch for ch in line if not ch.isspace()]
    readable = [ch for ch in visible if ch.isalnum() or ch in ".,;:!?'\"()-–—/&%"]
    return len(readable) >= 0.6 * len(visible)


def clean_lines(text: str) -> list[str]:
    lines = (" ".join(raw.split()) for raw in text.splitlines())
    return [line for line in lines if line and _is_clean(line)]


def _top_headings(topics: list[dict[str, Any]]) -> list[str]:
    """Cleaned, deduped top-level titles. Depth-1 topics are siblings, so ordinal is document order."""
    top_level = sorted(
        (topic for topic in topics if topic.get("depth") == 1),
        key=lambda topic: topic.get("ordinal", 0),
    )

    headings: list[str] = []
    seen: set[str] = set()
    used_chars = 0
    for topic in top_level:
        for title in clean_lines(str(topic.get("title") or "")):
            key = title.lower()
            if key in seen:
                continue
            if len(headings) >= MAX_HEADINGS or used_chars + len(title) > MAX_HEADING_CHARS:
                return headings
            seen.add(key)
            headings.append(title)
            used_chars += len(title)
    return headings


def _leading_body(chunks: list[dict[str, Any]]) -> str:
    """Clean leaf text from the start of the document. Chunks must arrive in document order."""
    body = ""
    for chunk in (chunk for chunk in chunks if chunk.get("role") == "leaf"):
        for line in clean_lines(str(chunk.get("text") or "")):
            if len(body) + len(line) + 1 > MAX_BODY_CHARS:
                return body
            body += line + "\n"
    return body


def build_summary_input(
    *, title: str, file_name: str, topics: list[dict[str, Any]], chunks: list[dict[str, Any]]
) -> str | None:
    """Bounded prompt from cleaned headings + leading body text; None when too little clean text."""
    body = _leading_body(chunks)
    if len(body) < MIN_BODY_CHARS:
        return None

    headings = _top_headings(topics)
    parts = [f"File: {file_name}"]
    if title and title != file_name:
        parts.append(f"Title: {title}")
    if headings:
        parts.append("Top-level headings:\n" + "\n".join(f"- {heading}" for heading in headings))
    parts.append("Opening text:\n" + body.strip())
    return "\n\n".join(parts)


def _post_chat(model: dict[str, str], messages: list[dict[str, str]]) -> dict[str, Any]:
    body = {
        "model": model["model"],
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": 400,
    }
    if model["provider"] == "fireworks":
        body["reasoning_effort"] = "low"

    req = urllib.request.Request(
        f"{model['base_url']}/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {model['api_key']}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_S, context=_ssl_context()) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        # Only for the error message — never read an unbounded error body.
        detail = err.read(MAX_ERROR_BODY_BYTES).decode("utf-8", errors="replace")
        raise RuntimeError(f"summary HTTP {err.code}: {detail}") from err


def _summary_text(payload: dict[str, Any]) -> str:
    choices = payload.get("choices") or []
    message = (choices[0].get("message") or {}) if choices else {}
    text = str(message.get("content") or "").strip()
    if len(text) <= MAX_SUMMARY_CHARS:
        return text
    return text[:MAX_SUMMARY_CHARS].rsplit(" ", 1)[0] + "…"


def summarize_sources(
    *, title: str, file_name: str, topics: list[dict[str, Any]], chunks: list[dict[str, Any]]
) -> str | None:
    """One model call. The summary, or None when skipped (too little clean text) or failed."""
    prompt = build_summary_input(title=title, file_name=file_name, topics=topics, chunks=chunks)
    if prompt is None:
        print(f"summary skipped for {file_name}: too little readable text", flush=True)
        return None

    model = resolve_summary_model()
    if model is None:
        print(f"summary skipped for {file_name}: no chat model API key", flush=True)
        return None

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]
    try:
        with observe(
            "summarize-document", as_type="generation", model=model["model"], input=messages
        ) as generation:
            payload = _post_chat(model, messages)
            summary = _summary_text(payload)
            if generation:
                usage = payload.get("usage") or {}
                generation.update(
                    output=summary,
                    usage_details={
                        "input": int(usage.get("prompt_tokens") or 0),
                        "output": int(usage.get("completion_tokens") or 0),
                    },
                )
    except Exception as err:  # noqa: BLE001 — a missing summary must never fail ingest
        print(f"summary failed for {file_name}: {err}", file=sys.stderr, flush=True)
        return None

    if not summary:
        print(f"summary empty for {file_name}: model returned no text", flush=True)
        return None
    return summary


def summarize_document(artifact: dict[str, Any]) -> str | None:
    """Summary for a freshly parsed PDF artifact (see pipeline.ingest_pdf)."""
    resource = artifact.get("resource") or {}
    return summarize_sources(
        title=str(resource.get("title") or ""),
        file_name=str(resource.get("name") or ""),
        topics=artifact.get("topics") or [],
        chunks=artifact.get("chunks") or [],
    )
