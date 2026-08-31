"""Tests for ingest materialization (topics + bridge/leaf chunks)."""

from __future__ import annotations

from pathlib import Path

import pytest
from everyday_ingest.heading_heuristics.heuristics import TopicNode
from everyday_ingest.pipeline import (
    bridge_summary,
    flatten_topics,
    ingest_pdf,
    materialize_chunks,
    split_leaf_chunks,
)


def test_split_leaf_chunks_respects_paragraphs():
    text = "Para one.\n\n" + ("word " * 200) + "\n\nPara three."
    parts = split_leaf_chunks(text, target_chars=200, overlap_chars=20)
    assert len(parts) >= 2
    assert all(p.strip() for p in parts)


def test_bridge_summary_includes_title_and_truncates():
    s = bridge_summary("I. Introduction", "A" * 2000, max_chars=80)
    assert s.startswith("I. Introduction.")
    assert s.endswith("…")
    assert len(s) < 200


def test_flatten_topics_page_ranges():
    root = TopicNode(title="Doc", level=-1)
    intro = TopicNode(title="I. Introduction", level=0, page=3)
    methods = TopicNode(title="II. Methods", level=0, page=4)
    data = TopicNode(title="A. Data", level=1, page=4)
    results = TopicNode(title="III. Results", level=0, page=6)
    methods.children = [data]
    root.children = [intro, methods, results]

    topics = flatten_topics(root, page_count=6, structure_source="toc")
    by_title = {t.title: t for t in topics}
    assert by_title["I. Introduction"].page_start == 3
    assert by_title["I. Introduction"].page_end == 3
    assert by_title["II. Methods"].page_start == 4
    assert by_title["II. Methods"].page_end == 5
    assert by_title["A. Data"].page_start == 4
    assert by_title["A. Data"].page_end == 5
    assert by_title["III. Results"].page_end == 6
    assert by_title["Doc"].parent_id is None


def test_materialize_bridge_and_leaf_invariants():
    root = TopicNode(title="Doc", level=-1)
    a = TopicNode(title="I. Intro", level=0, page=1)
    b = TopicNode(title="II. End", level=0, page=2)
    root.children = [a, b]
    topics = flatten_topics(root, page_count=2, structure_source="toc")
    page_texts = {1: "Intro body " * 50, 2: "End body " * 50}
    chunks = materialize_chunks(topics, page_texts, leaf_target_chars=500)

    bridges = [c for c in chunks if c.role == "bridge"]
    leaves = [c for c in chunks if c.role == "leaf"]
    assert bridges
    assert leaves
    for c in bridges:
        assert c.child_topic_id is not None
        assert c.parent_topic_id
    for c in leaves:
        assert c.child_topic_id is None
    # Root should have bridge into each top section
    root_id = next(t.id for t in topics if t.parent_id is None)
    root_bridges = [c for c in bridges if c.parent_topic_id == root_id]
    assert len(root_bridges) == 2


def test_ingest_headed_pdf(headed_pdf: Path):
    result = ingest_pdf(headed_pdf, source_mode="heuristics")
    assert result["resource"]["status"] == "ready"
    assert result["resource"]["content_hash"]
    assert result["meta"]["topic_count"] >= 2
    assert result["meta"]["chunk_count"] >= 1
    assert result["meta"]["bridge_count"] >= 1
    assert result["topics"]
    assert result["chunks"]
    assert result["card"]["outline"]

    topic_ids = {t["id"] for t in result["topics"]}
    for c in result["chunks"]:
        assert c["parent_topic_id"] in topic_ids
        if c["role"] == "bridge":
            assert c["child_topic_id"] in topic_ids
        else:
            assert c["child_topic_id"] is None
            assert c["role"] == "leaf"


def test_ingest_toc_pdf(toc_pdf: Path):
    result = ingest_pdf(toc_pdf, source_mode="toc")
    assert result["resource"]["structure_source"] == "toc"
    titles = [t["title"] for t in result["topics"] if t["level"] == 0]
    assert "I. Introduction" in titles
    assert "II. Methods" in titles
    # Leaf under B. Analysis
    leaf_topics = [t for t in result["topics"] if t["title"].startswith("1. Statistical")]
    assert leaf_topics
    leaf_id = leaf_topics[0]["id"]
    leaf_chunks = [
        c for c in result["chunks"] if c["role"] == "leaf" and c["parent_topic_id"] == leaf_id
    ]
    assert leaf_chunks
    assert "t-tests" in leaf_chunks[0]["text"] or "ANOVA" in leaf_chunks[0]["text"]


@pytest.mark.skipif(
    not (Path(__file__).resolve().parents[1] / "test.pdf").exists(),
    reason="repo test.pdf not present",
)
def test_ingest_repo_test_pdf(repo_test_pdf: Path):
    assert repo_test_pdf is not None
    result = ingest_pdf(repo_test_pdf, source_mode="auto")
    assert result["meta"]["topic_count"] >= 20
    assert result["meta"]["bridge_count"] >= 10
    assert result["meta"]["leaf_count"] >= 5
    assert result["resource"]["structure_source"] in {"bookmarks", "toc"}
