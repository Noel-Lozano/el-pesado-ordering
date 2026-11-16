from pesado_debug.core import logs
from tests.fixtures import fixture_text

FAILED_STEP_LOG = fixture_text("logs", "job-failed-step.txt")
NO_GROUPS_LOG = fixture_text("logs", "job-no-groups.txt")


def test_clean_strips_bom_ansi_timestamps_and_endgroup() -> None:
    lines = logs.clean(FAILED_STEP_LOG)
    assert lines[0] == "##[group]Run actions/checkout@v4"
    assert "##[endgroup]" not in lines
    assert all("\x1b" not in line for line in lines)
    assert not any(line.startswith("2026-") for line in lines)
    assert (
        "src/routes/orders.ts(42,7): error TS2322: Type 'string' is not assignable to type 'number'." in lines
    )


def test_slice_starts_at_the_group_holding_the_first_error() -> None:
    sliced = logs.slice_failed_step(logs.clean(FAILED_STEP_LOG))
    assert sliced[0] == "##[group]Run npm run typecheck"
    assert "##[error]Process completed with exit code 2." in sliced
    assert "added 312 packages in 9s" not in sliced
    # Ends before the next step (an if: always() upload) and the post-job cleanup.
    assert sliced[-1] == "##[error]Process completed with exit code 2."


def test_slice_stops_at_post_job_cleanup() -> None:
    lines = ["##[group]Run npm run build", "boom", "##[error]exit 1", "Post job cleanup.", "git config"]
    assert logs.slice_failed_step(lines) == lines[:3]


def test_errors_from_other_steps_are_appended() -> None:
    text = "\n".join(
        [
            "##[group]Run npm test",
            "##[error]tests failed",
            "##[group]Run upload",
            "##[error]upload failed too",
        ]
    )
    result = logs.extract(text, tail_lines=200, grep=None, max_chars=20_000)
    assert result.lines == [
        "##[group]Run npm test",
        "##[error]tests failed",
        "… errors elsewhere in this job:",
        "##[error]upload failed too",
    ]


def test_slice_without_groups_or_errors_keeps_everything() -> None:
    lines = logs.clean(NO_GROUPS_LOG)
    assert logs.slice_failed_step(lines) == lines
    assert logs.slice_failed_step(["a", "b"]) == ["a", "b"]


def test_extract_default_is_failed_step_untruncated() -> None:
    result = logs.extract(FAILED_STEP_LOG, tail_lines=200, grep=None, max_chars=20_000)
    assert result.lines[0] == "##[group]Run npm run typecheck"
    assert not result.truncated
    assert result.hint is None


def test_grep_searches_whole_log_and_keeps_errors() -> None:
    result = logs.extract(FAILED_STEP_LOG, tail_lines=200, grep="PACKAGES", max_chars=20_000)
    assert result.lines == ["added 312 packages in 9s", "##[error]Process completed with exit code 2."]


def test_tail_keeps_early_error_lines_and_says_so() -> None:
    text = "\n".join(["##[error]early failure", *[f"line {i}" for i in range(50)]])
    result = logs.extract(text, tail_lines=5, grep=None, max_chars=20_000)
    assert result.lines[0] == "##[error]early failure"
    assert result.lines[1] == "… 45 earlier lines omitted …"
    assert result.lines[-1] == "line 49"
    assert result.truncated
    assert result.hint is not None and "tail_lines" in result.hint


def test_char_cap_keeps_the_end() -> None:
    text = "\n".join(f"line {i:04d}" for i in range(1000))
    result = logs.extract(text, tail_lines=1000, grep=None, max_chars=100)
    assert sum(len(line) + 1 for line in result.lines) <= 100
    assert result.lines[-1] == "line 0999"
    assert result.truncated
    assert result.hint is not None and "grep" in result.hint


def test_single_huge_line_is_cut_to_its_end() -> None:
    result = logs.extract("x" * 50_000 + "END", tail_lines=10, grep=None, max_chars=1_000)
    assert len(result.lines) == 1
    assert result.lines[0].endswith("END")
    assert len(result.lines[0]) <= 1_000
    assert result.truncated
