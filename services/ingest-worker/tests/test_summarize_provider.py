"""resolve_summary_model picks the same provider as the API's chat model."""

from __future__ import annotations

import pytest
from syraa_ingest.summarize import resolve_summary_model

ENV_VARS = [
    "CHAT_PROVIDER",
    "FIREWORKS_API_KEY",
    "OPENAI_API_KEY",
    "AI_GATEWAY_API_KEY",
    "AI_GATEWAY_MODEL",
    "AI_GATEWAY_BASE_URL",
    "SUMMARY_MODEL",
]


@pytest.fixture(autouse=True)
def clean_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ENV_VARS:
        monkeypatch.delenv(name, raising=False)


def test_gateway_selected_explicitly(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CHAT_PROVIDER", "gateway")
    monkeypatch.setenv("AI_GATEWAY_API_KEY", "gw")
    assert resolve_summary_model() == {
        "provider": "gateway",
        "api_key": "gw",
        "model": "openai/gpt-oss-120b",
        "base_url": "https://ai-gateway.vercel.sh/v1",
    }


def test_gateway_selected_from_key_alone(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("AI_GATEWAY_API_KEY", "gw")
    monkeypatch.setenv("AI_GATEWAY_MODEL", "openai/gpt-4o-mini")
    model = resolve_summary_model()
    assert model is not None
    assert (model["provider"], model["model"]) == ("gateway", "openai/gpt-4o-mini")


def test_summary_model_overrides_model_only(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CHAT_PROVIDER", "gateway")
    monkeypatch.setenv("AI_GATEWAY_API_KEY", "gw")
    monkeypatch.setenv("SUMMARY_MODEL", "openai/gpt-4o-mini")
    model = resolve_summary_model()
    assert model is not None
    assert model["model"] == "openai/gpt-4o-mini"


def test_none_without_key(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CHAT_PROVIDER", "gateway")
    assert resolve_summary_model() is None
