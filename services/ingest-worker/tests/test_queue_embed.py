import pytest
from syraa_ingest import embed
from syraa_ingest.embed import embed_texts, resolve_embedding_config
from syraa_ingest.queue_protocol import QUEUE_KEY, IngestJob

EMBEDDING_ENV = (
    "EMBEDDING_PROVIDER",
    "EMBEDDING_MODEL",
    "EMBEDDING_BASE_URL",
    "EMBEDDING_API_KEY",
    "EMBEDDING_DIMS",
    "FIREWORKS_API_KEY",
    "OPENAI_API_KEY",
)


@pytest.fixture(autouse=True)
def _clean_embedding_env(monkeypatch) -> None:
    for name in EMBEDDING_ENV:
        monkeypatch.delenv(name, raising=False)
    embed._warned_dims.clear()


def test_queue_key() -> None:
    assert QUEUE_KEY == "syraa:ingest:queue"


def test_job_from_json() -> None:
    job = IngestJob.from_json(
        b'{"jobId":"j1","userId":"u1","resourceId":"r1","driveKey":"u1/a.pdf",'
        b'"filePath":"/data/a.pdf","mime":"application/pdf","name":"a.pdf"}'
    )
    assert job.job_id == "j1"
    assert job.resource_id == "r1"


def test_hash_embeddings(monkeypatch) -> None:
    monkeypatch.setenv("EMBEDDING_PROVIDER", "hash")
    monkeypatch.setenv("EMBEDDING_DIMS", "8")
    cfg = resolve_embedding_config()
    assert cfg["provider"] == "hash"
    vectors, provider = embed_texts(["hello", "world"])
    assert provider == "hash"
    assert len(vectors) == 2
    assert vectors[0] is not None
    assert len(vectors[0]) == 8


def test_none_embeddings(monkeypatch) -> None:
    monkeypatch.setenv("EMBEDDING_PROVIDER", "none")
    vectors, provider = embed_texts(["hello"])
    assert provider == "none"
    assert vectors == [None]


def test_blank_env_uses_defaults(monkeypatch) -> None:
    # compose passes `${EMBEDDING_MODEL:-}` → "" when unset; treat blank as unset.
    monkeypatch.setenv("EMBEDDING_PROVIDER", "fireworks")
    monkeypatch.setenv("FIREWORKS_API_KEY", "k")
    monkeypatch.setenv("EMBEDDING_MODEL", "")
    monkeypatch.setenv("EMBEDDING_BASE_URL", "  ")
    cfg = resolve_embedding_config()
    assert cfg["model"] == "nomic-ai/nomic-embed-text-v1.5"
    assert cfg["base_url"] == "https://api.fireworks.ai/inference/v1"

    monkeypatch.setenv("EMBEDDING_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "k")
    cfg = resolve_embedding_config()
    assert cfg["model"] == "text-embedding-3-small"
    assert cfg["base_url"] == "https://api.openai.com/v1"


def test_blank_dims_uses_default(monkeypatch) -> None:
    monkeypatch.setenv("EMBEDDING_PROVIDER", "hash")
    monkeypatch.setenv("EMBEDDING_DIMS", "")
    vectors, _ = embed_texts(["hello"])
    assert len(vectors[0]) == 64


def test_explicit_model_kept(monkeypatch) -> None:
    monkeypatch.setenv("EMBEDDING_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "k")
    monkeypatch.setenv("EMBEDDING_MODEL", "text-embedding-3-large")
    assert resolve_embedding_config()["model"] == "text-embedding-3-large"


def test_blank_provider_means_auto(monkeypatch) -> None:
    monkeypatch.setenv("EMBEDDING_PROVIDER", " ")
    monkeypatch.setenv("OPENAI_API_KEY", "k")
    assert resolve_embedding_config()["provider"] == "openai"


def test_whitespace_key_is_unset(monkeypatch) -> None:
    monkeypatch.setenv("FIREWORKS_API_KEY", "  ")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-real\n")
    cfg = resolve_embedding_config()
    assert cfg["provider"] == "openai"
    assert cfg["api_key"] == "sk-real"


def test_blank_provider_key_falls_back_to_embedding_api_key(monkeypatch) -> None:
    monkeypatch.setenv("EMBEDDING_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "")
    monkeypatch.setenv("EMBEDDING_API_KEY", "sk-embed")
    assert resolve_embedding_config()["api_key"] == "sk-embed"


@pytest.mark.parametrize("dims", ["auto", "768d", "0", "-3", "100000000"])
def test_bad_dims_never_raise(monkeypatch, capsys, dims) -> None:
    monkeypatch.setenv("EMBEDDING_PROVIDER", "hash")
    monkeypatch.setenv("EMBEDDING_DIMS", dims)
    vectors, _ = embed_texts(["hello"])
    embed_texts(["again"])
    assert len(vectors[0]) == 64
    assert capsys.readouterr().err.count("EMBEDDING_DIMS") == 1


def test_remote_failure_falls_back_to_fixed_dims(monkeypatch) -> None:
    monkeypatch.setenv("EMBEDDING_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "k")
    monkeypatch.setenv("EMBEDDING_DIMS", "768")

    def refuse(*_args, **_kwargs):
        raise RuntimeError("embedding HTTP 503")

    monkeypatch.setattr(embed, "_openai_compatible_embed", refuse)
    vectors, provider = embed_texts(["hello"])
    assert provider == "hash-fallback:openai"
    assert len(vectors[0]) == 64
