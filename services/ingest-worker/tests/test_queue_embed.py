from syraa_ingest.embed import embed_texts, resolve_embedding_config
from syraa_ingest.queue_protocol import QUEUE_KEY, IngestJob


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
    monkeypatch.delenv("FIREWORKS_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
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
