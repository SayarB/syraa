"""Shared PDF fixtures for heading / ingest tests."""

from __future__ import annotations

from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


def write_headed_pdf(path: Path) -> Path:
    """Syllabus-like PDF with font-size headings (no TOC, no bookmarks)."""
    import pymupdf

    path.parent.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open()
    page = doc.new_page()
    y = 72
    blocks = [
        ("Biology 101 Syllabus", 24, True),
        ("1 Course overview", 18, True),
        ("This course covers cells, genetics, and ecology.", 11, False),
        ("1.1 Learning outcomes", 14, True),
        ("Students will explain mitosis and meiosis.", 11, False),
        ("1.2 Grading", 14, True),
        ("Quizzes 20%. Midterm 30%. Final 50%.", 11, False),
        ("2 Cell biology", 18, True),
        ("2.1 Organelles", 14, True),
        ("Mitochondria, nucleus, ribosomes.", 11, False),
        ("2.2 Mitosis", 14, True),
        ("Prophase, metaphase, anaphase, telophase.", 11, False),
        ("3 Genetics", 18, True),
        ("3.1 Meiosis", 14, True),
        ("Reduction division and crossing over.", 11, False),
    ]
    for text, size, bold in blocks:
        font = "Helvetica-Bold" if bold else "Helvetica"
        page.insert_text((72, y), text, fontsize=size, fontname=font)
        y += size + 10
    doc.save(path)
    doc.close()
    return path


def write_toc_pdf(path: Path) -> Path:
    """Multi-page PDF with a printed Table of Contents + body sections."""
    import pymupdf

    path.parent.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open()

    # Page 1: cover
    cover = doc.new_page()
    cover.insert_text((72, 200), "Feasibility Report", fontsize=28, fontname="Helvetica-Bold")

    # Page 2: TOC
    toc = doc.new_page()
    toc.insert_text((72, 72), "Table of Contents", fontsize=22, fontname="Helvetica-Bold")
    toc_rows = [
        (110, "I. Introduction", "3", 12),
        (130, "II. Methods", "4", 12),
        (148, "A. Data collection", "4", 10),
        (166, "B. Analysis", "5", 10),
        (184, "1. Statistical tests", "5", 10),
        (204, "III. Results", "6", 12),
    ]
    for y, title, page_no, size in toc_rows:
        toc.insert_text((72, y), title, fontsize=size, fontname="Helvetica")
        toc.insert_text((500, y), page_no, fontsize=size, fontname="Helvetica")

    # Body pages 3–6
    bodies = [
        (3, "I. Introduction", "Intro body paragraph one.\n\nIntro body paragraph two."),
        (4, "II. Methods", "Methods overview."),
        (4, "A. Data collection", "We collected samples from three sites."),
        (5, "B. Analysis", "Analysis overview."),
        (5, "1. Statistical tests", "We ran t-tests and ANOVA."),
        (6, "III. Results", "Results were significant at p < 0.05."),
    ]
    # Build page map
    page_content: dict[int, list[tuple[str, str]]] = {}
    for page_no, heading, body in bodies:
        page_content.setdefault(page_no, []).append((heading, body))

    for page_no in range(3, 7):
        page = doc.new_page()
        y = 72
        for heading, body in page_content.get(page_no, []):
            page.insert_text((72, y), heading, fontsize=16, fontname="Helvetica-Bold")
            y += 28
            for line in body.split("\n"):
                page.insert_text((72, y), line, fontsize=11, fontname="Helvetica")
                y += 16
            y += 12

    doc.save(path)
    doc.close()
    return path


@pytest.fixture
def headed_pdf(tmp_path: Path) -> Path:
    return write_headed_pdf(tmp_path / "headed.pdf")


@pytest.fixture
def toc_pdf(tmp_path: Path) -> Path:
    return write_toc_pdf(tmp_path / "toc.pdf")


@pytest.fixture
def repo_test_pdf() -> Path | None:
    p = ROOT / "test.pdf"
    return p if p.exists() else None
