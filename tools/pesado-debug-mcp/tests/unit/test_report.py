import re
from pathlib import Path

from pesado_debug import cli
from pesado_debug.core import report
from tests.fixtures import fixture_path

REPORTS = fixture_path("report")


def _snapshot(name: str) -> str:
    return (REPORTS / f"{name}.expected.md").read_bytes().decode("utf-8")


def test_mixed_suites_matches_snapshot() -> None:
    assert report.build_report(REPORTS / "mixed-suites") == _snapshot("mixed-suites")


def test_hostile_names_match_snapshot() -> None:
    assert report.build_report(REPORTS / "hostile-names") == _snapshot("hostile-names")


def test_suite_rows_are_named_from_folder_and_file() -> None:
    markdown = report.build_report(REPORTS / "mixed-suites")
    assert "| backend (integration) | 1 | 2 | 1 | 33.3% |" in markdown
    assert "| backend (unit) | 17 | 0 | 0 | 100% |" in markdown
    assert "| frontend (unit) |" in markdown


def test_all_passing_gives_the_check_line(tmp_path: Path) -> None:
    (tmp_path / "junit-backend").mkdir()
    (tmp_path / "junit-backend" / "junit-unit.xml").write_bytes(
        fixture_path("junit", "vitest-pass.xml").read_bytes()
    )
    markdown = report.build_report(tmp_path)
    assert markdown.startswith("### ✅ All 17 tests passed\n")
    assert "Failing tests" not in markdown


def test_no_junit_says_tests_never_ran() -> None:
    markdown = report.build_report(REPORTS / "no-junit", run_url="https://github.com/o/r/actions/runs/1")
    assert "the run failed before tests ran" in markdown
    assert markdown.rstrip().endswith("https://github.com/o/r/actions/runs/1")


def test_missing_folder_is_the_same_as_no_junit(tmp_path: Path) -> None:
    assert "No test results" in report.build_report(tmp_path / "artifacts")


def test_hostile_names_render_as_text() -> None:
    markdown = report.build_report(REPORTS / "hostile-names")
    assert "<script>" not in markdown
    assert "&lt;script&gt;" in markdown
    # Every table row still has exactly five cells.
    for line in markdown.splitlines():
        if line.startswith("| "):
            assert line.count("|") == 6, line
    # No summary line contains raw markdown or pipe characters.
    for line in markdown.splitlines():
        if line.startswith("<summary>"):
            assert not re.search(r"[|`*\[\]]", line), line


def test_code_fence_is_longer_than_any_backtick_run() -> None:
    block = report.code_block("a ```` b")
    assert block.startswith("`````text\n") and block.endswith("\n`````")
    assert report.code_block("plain").startswith("```text\n")


def test_hostile_message_cannot_close_its_code_block() -> None:
    markdown = report.build_report(REPORTS / "hostile-names")
    assert "`````text\n**bold**" in markdown


def test_more_than_25_failures_shows_a_count(tmp_path: Path) -> None:
    cases = "".join(f'<testcase name="t{i}"><failure message="m"/></testcase>' for i in range(30))
    (tmp_path / "junit-backend").mkdir()
    (tmp_path / "junit-backend" / "junit-unit.xml").write_text(
        f'<testsuite name="s">{cases}</testsuite>', encoding="utf-8"
    )
    markdown = report.build_report(tmp_path)
    assert markdown.count("<details>") == 25
    assert "+5 more: see the `junit-*` artifacts." in markdown


def test_unparseable_report_is_listed_not_fatal(tmp_path: Path) -> None:
    (tmp_path / "junit-frontend").mkdir()
    (tmp_path / "junit-frontend" / "junit-unit.xml").write_bytes(
        fixture_path("junit", "xxe.xml").read_bytes()
    )
    markdown = report.build_report(tmp_path)
    assert "Reports that couldn" in markdown
    assert "rejected unsafe XML" in markdown


def test_cli_appends_and_exits_zero_with_failures(tmp_path: Path) -> None:
    out = tmp_path / "summary.md"
    out.write_bytes(b"existing content\n")
    code = cli.run(["report", "--from-dir", str(REPORTS / "mixed-suites"), "--out", str(out)])
    assert code == 0
    text = out.read_bytes().decode("utf-8")
    assert text.startswith("existing content\n### 🔴 CI failed")
    assert "\r\n" not in text


def test_plain_run_url_stays_linkable_and_odd_ones_are_escaped() -> None:
    plain = "https://github.com/Noel-Lozano/el_pesado/actions/runs/1"
    assert plain in report.build_report(REPORTS / "no-junit", run_url=plain)
    odd = report.build_report(REPORTS / "no-junit", run_url="javascript:alert(1)|x")
    assert "javascript:alert(1)&#124;x" in odd
