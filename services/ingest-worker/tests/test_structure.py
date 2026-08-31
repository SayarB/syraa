"""Integration tests for structure extraction from PDFs."""

from __future__ import annotations

from pathlib import Path

import pytest
from everyday_ingest.heading_heuristics.structure import extract_structure_tree


def test_structure_heuristics_on_headed_pdf(headed_pdf: Path):
    tree, meta = extract_structure_tree(headed_pdf, source_mode="heuristics")
    assert meta["source"] == "heuristics"
    titles = [c.title for c in tree.children]
    assert any("Course overview" in t or t.startswith("1 ") for t in titles)
    # Nested 1.x under first section when numbering works
    overview = next(
        c for c in tree.children if "overview" in c.title.lower() or c.title.startswith("1 ")
    )
    assert any("1.1" in c.title or "Learning" in c.title for c in overview.children)


def test_structure_toc_on_toc_pdf(toc_pdf: Path):
    tree, meta = extract_structure_tree(toc_pdf, source_mode="toc")
    assert meta["source"] == "toc"
    assert 2 in meta["toc_pages"]
    assert [c.title for c in tree.children][:3] == [
        "I. Introduction",
        "II. Methods",
        "III. Results",
    ]
    methods = tree.children[1]
    assert methods.children[0].title.startswith("A.")
    assert methods.children[1].children[0].title.startswith("1.")


def test_structure_auto_prefers_toc_without_bookmarks(toc_pdf: Path):
    tree, meta = extract_structure_tree(toc_pdf, source_mode="auto_no_bookmarks")
    assert meta["source"] == "toc"
    assert tree.children


@pytest.mark.skipif(
    not (Path(__file__).resolve().parents[1] / "test.pdf").exists(),
    reason="repo test.pdf not present",
)
def test_structure_auto_on_repo_test_pdf(repo_test_pdf: Path):
    assert repo_test_pdf is not None
    tree, meta = extract_structure_tree(repo_test_pdf, source_mode="auto")
    assert meta["source"] in {"bookmarks", "toc"}
    assert meta["stats"]["node_count"] >= 20
    assert any(c.title.startswith("I.") for c in tree.children)
