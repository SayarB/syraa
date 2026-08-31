from everyday_ingest.embed import embed_texts, resolve_embedding_config
from everyday_ingest.queue_protocol import QUEUE_KEY, IngestJob


def test_queue_key() -> None:
    assert QUEUE_KEY == "everyday:ingest:queue"


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
