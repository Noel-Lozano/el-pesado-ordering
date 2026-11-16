import pytest

from pesado_debug.core import junit
from pesado_debug.core.junit import JUnitError
from tests.fixtures import fixture_path

CI_ROOT = "/home/runner/work/el-pesado-ordering/el-pesado-ordering"


def _parse(name: str, workspace: str | None = "backend") -> junit.ParsedReport:
    data = fixture_path("junit", name).read_bytes()
    return junit.parse_report(name, data, workspace=workspace, repo_root=CI_ROOT)


def test_vitest_pass_counts_everything_passed() -> None:
    result = junit.to_failing_tests([_parse("vitest-pass.xml")])
    assert result.total == 17
    assert result.failed == result.errors == result.skipped == 0
    assert result.failures == []
    assert not result.truncated


def test_vitest_fail_reports_assertion_import_error_and_skip() -> None:
    result = junit.to_failing_tests([_parse("vitest-fail.xml")])
    assert (result.total, result.failed, result.skipped, result.errors) == (4, 2, 1, 0)
    import_error, assertion = result.failures

    assert import_error.file == "backend/src/test/unit/lib/broken.test.ts"
    assert import_error.message.startswith("Error: Cannot find module '../../../lib/does-not-exist.js'")
    assert import_error.stack == ["backend/src/test/unit/lib/broken.test.ts:1:1"]

    assert assertion.name == "pricing fixture > rejects items before 14:00"
    assert assertion.file == "backend/src/test/unit/lib/fixture.test.ts"
    assert "- 400\n+ 4500" in assertion.message  # the diff is kept
    assert assertion.stack == ["backend/src/test/unit/lib/fixture.test.ts:9:87"]
    assert assertion.duration_ms == 17


def test_suite_level_error_without_testcase() -> None:
    result = junit.to_failing_tests([_parse("vitest-suite-error.xml")])
    assert (result.total, result.errors) == (1, 1)
    (failure,) = result.failures
    assert failure.name == junit.SUITE_ERROR_NAME
    assert failure.file == "backend/src/test/integration/routes/orders.test.ts"
    assert failure.message == "Error: connect ECONNREFUSED 127.0.0.1:5432"
    # node_modules frame dropped, the test's own frame kept.
    assert failure.stack == ["backend/src/test/integration/routes/orders.test.ts:73:3"]


def test_jest_junit_format() -> None:
    result = junit.to_failing_tests([_parse("jest-junit-fail.xml")])
    assert (result.total, result.failed) == (2, 1)
    (failure,) = result.failures
    assert failure.file == "backend/src/lib/pricing.test.ts"
    assert "Received: 1049" in failure.message
    # Absolute CI paths become repo-relative; node_modules, node: and <anonymous> frames are dropped.
    assert failure.stack == [
        "Object.<anonymous> (backend/src/lib/pricing.test.ts:12:31)",
        "computeOrderTotal (backend/src/lib/pricing.ts:20:9)",
    ]


def test_local_absolute_paths_are_made_repo_relative() -> None:
    xml = (
        b'<testsuite name="s"><testcase name="t" classname="src/a.test.ts"><failure>boom\n'
        b" \xe2\x9d\xaf C:/repo/backend/src/a.test.ts:3:1\n"
        b" \xe2\x9d\xaf C:/elsewhere/lib.js:1:1\n"
        b"</failure></testcase></testsuite>"
    )
    report = junit.parse_report("x.xml", xml, workspace="backend", repo_root="C:\\repo")
    (case,) = report.cases
    assert case.stack == ("backend/src/a.test.ts:3:1",)
    assert case.file == "backend/src/a.test.ts"


def test_vitest_frame_with_function_name_and_no_parentheses() -> None:
    """Real Vitest 5 output from the integration-db eval case."""
    xml = (
        '<testsuite name="s"><testcase name="src/test/integration/routes/orders.test.ts" '
        'classname="src/test/integration/routes/orders.test.ts"><failure>'
        "Error: Seeded menu item missing: Burritos / Frijoles con carne\n"
        " \u276f menuItem src/test/integration/routes/orders.test.ts:37:23\n"
        " \u276f src/test/integration/routes/orders.test.ts:75:13\n"
        "</failure></testcase></testsuite>"
    )
    (case,) = junit.parse_report("x.xml", xml.encode(), workspace="backend").cases
    assert case.message == "Error: Seeded menu item missing: Burritos / Frijoles con carne"
    assert case.stack == (
        "menuItem (backend/src/test/integration/routes/orders.test.ts:37:23)",
        "backend/src/test/integration/routes/orders.test.ts:75:13",
    )


def test_stack_is_capped_at_eight_frames() -> None:
    frames = "".join(f" \u276f src/a.test.ts:{i}:1\n" for i in range(20))
    xml = f'<testsuite name="s"><testcase name="t"><failure>boom\n{frames}</failure></testcase></testsuite>'
    (case,) = junit.parse_report("x.xml", xml.encode(), workspace="backend").cases
    assert len(case.stack) == junit.MAX_STACK_FRAMES


def test_failures_are_capped_with_a_hint() -> None:
    cases = "".join(f'<testcase name="t{i}"><failure message="m{i}"/></testcase>' for i in range(30))
    report = junit.parse_report("x.xml", f'<testsuite name="s">{cases}</testsuite>'.encode(), workspace=None)
    result = junit.to_failing_tests([report])
    assert len(result.failures) == 25
    assert result.failed == 30
    assert result.truncated
    assert result.hint is not None and "5 more" in result.hint


def test_long_messages_are_cut() -> None:
    xml = f'<testsuite name="s"><testcase name="t"><failure>{"x" * 5000}</failure></testcase></testsuite>'
    (case,) = junit.parse_report("x.xml", xml.encode(), workspace=None).cases
    assert len(case.message) == junit.MAX_MESSAGE_CHARS + 1


@pytest.mark.parametrize("name", ["xxe.xml", "billion-laughs.xml"])
def test_hostile_xml_is_rejected(name: str) -> None:
    with pytest.raises(JUnitError, match="rejected unsafe XML"):
        _parse(name)


def test_malformed_xml_is_a_clean_error() -> None:
    with pytest.raises(JUnitError, match="not valid XML"):
        junit.parse_report("x.xml", b"<testsuite><testcase>", workspace=None)


def test_summary_mentions_first_failures() -> None:
    summary = junit.summarize(junit.to_failing_tests([_parse("vitest-fail.xml")]))
    assert summary.startswith("4 tests: 2 failed, 0 errors, 1 skipped")
    assert "rejects items before 14:00" in summary
