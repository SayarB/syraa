"""Unit tests for heading heuristics and TOC level rules."""

from __future__ import annotations

from everyday_ingest.heading_heuristics.heuristics import (
    Line,
    assign_levels_by_font,
    build_tree,
    find_toc_pages,
    heading_score,
    outline_from_toc,
    parse_toc_entries,
    select_candidates,
    toc_entry_level,
)


def test_heading_score_prefers_large_bold_short_lines():
    body = 11.0
    heading = Line("1 Course overview", page=1, y=100, x=72, font_size=18, bold=True)
    body_line = Line(
        "This course covers cells, genetics, and ecology in significant depth for majors.",
        page=1,
        y=120,
        x=72,
        font_size=11,
        bold=False,
    )
    assert heading_score(heading, body) >= 4.0
    assert heading_score(body_line, body) < 4.0


def test_toc_entry_level_roman_letter_number():
    assert toc_entry_level("I. Introduction") == 0
    assert toc_entry_level("II. Methods") == 0
    assert toc_entry_level("A. Data collection") == 1
    assert toc_entry_level("C. Nested under chapter") == 1  # not Roman C
    assert toc_entry_level("1. Statistical tests") == 2
    assert toc_entry_level("V. Results") == 0  # Roman V


def test_build_tree_from_numbered_candidates():
    lines = [
        Line("1 Course overview", 1, 100, 72, 18, True, score=10, level=0, number_path=(1,)),
        Line("1.1 Learning outcomes", 1, 120, 72, 14, True, score=8, level=1, number_path=(1, 1)),
        Line("2 Cell biology", 1, 200, 72, 18, True, score=10, level=0, number_path=(2,)),
    ]
    tree = build_tree(lines, doc_title="Doc")
    assert len(tree.children) == 2
    assert tree.children[0].title.startswith("1 ")
    assert len(tree.children[0].children) == 1
    assert tree.children[1].title.startswith("2 ")


def test_assign_levels_number_path_overrides_font():
    c = Line("1.2 Grading", 1, 10, 10, 24, True, number_path=(1, 2))
    assign_levels_by_font([c])
    assert c.level == 1


def test_parse_toc_entries_pairs_title_and_page():
    lines = [
        Line("Table of Contents", 2, 67, 72, 22, True),
        Line("I. Introduction", 2, 110, 72, 12, False),
        Line("3", 2, 110, 500, 12, False),
        Line("A. Data collection", 2, 130, 72, 10, False),
        Line("4", 2, 130, 500, 10, False),
        Line("wrapped continuation of title", 2, 142, 72, 10, False),
        Line("1. Statistical tests", 2, 160, 72, 10, False),
        Line("5", 2, 160, 500, 10, False),
    ]
    pages = find_toc_pages(lines)
    assert pages == {2}
    entries = parse_toc_entries(lines, pages)
    assert entries[0][:2] == ("I. Introduction", 3)
    assert entries[1][0].startswith("A. Data collection")
    assert "wrapped continuation" in entries[1][0]
    assert entries[1][1] == 4
    assert entries[2][0].startswith("1.")
    assert toc_entry_level(entries[0][0]) == 0
    assert toc_entry_level(entries[1][0]) == 1


def test_outline_from_toc_builds_nested_tree():
    lines = [
        Line("Table of Contents", 1, 50, 72, 22, True),
        Line("I. Introduction", 1, 100, 72, 12, False),
        Line("3", 1, 100, 500, 12, False),
        Line("II. Methods", 1, 120, 72, 12, False),
        Line("4", 1, 120, 500, 12, False),
        Line("A. Data collection", 1, 140, 72, 10, False),
        Line("4", 1, 140, 500, 10, False),
        Line("B. Analysis", 1, 160, 72, 10, False),
        Line("5", 1, 160, 500, 10, False),
        Line("1. Statistical tests", 1, 180, 72, 10, False),
        Line("5", 1, 180, 500, 10, False),
    ]
    tree = outline_from_toc(lines, doc_title="Report")
    assert tree is not None
    assert [c.title for c in tree.children] == ["I. Introduction", "II. Methods"]
    methods = tree.children[1]
    assert [c.title for c in methods.children] == ["A. Data collection", "B. Analysis"]
    assert methods.children[1].children[0].title.startswith("1.")


def test_select_candidates_threshold():
    lines = [
        Line("Big", 1, 1, 1, 20, True, score=8),
        Line("Small", 1, 2, 1, 11, False, score=2),
    ]
    assert [c.text for c in select_candidates(lines, min_score=4)] == ["Big"]
