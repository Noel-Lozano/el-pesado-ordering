"""JUnit XML parsing, shared by get_failing_tests, rerun_test and the CI report.

JUnit files from CI artifacts are untrusted input, so XML is parsed only with
defusedxml, with DTDs forbidden (JUnit never needs one): XXE and entity
expansion ("billion laughs") payloads are rejected, not expanded.

Handles Vitest's reporter (an import error is a failed testcase named after the
file; frames look like `U+276F src/x.test.ts:9:87`) and jest-junit's (a `file`
attribute; frames look like `at fn (/abs/path.ts:12:31)`), plus suite-level
`<error>`/`<failure>` elements with no testcase.
"""

import re
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Literal, Protocol
from xml.etree.ElementTree import Element, ParseError

from defusedxml import DefusedXmlException
from defusedxml.ElementTree import fromstring

from pesado_debug.models import FailingTests, TestFailure

MAX_FAILURES = 25
MAX_STACK_FRAMES = 8
MAX_MESSAGE_CHARS = 1_500
SUITE_ERROR_NAME = "(suite error)"

CaseStatus = Literal["passed", "failed", "error", "skipped"]

# Vitest: "U+276F path:1:2" or "U+276F fn path:1:2". V8 / Jest: "at fn (path:1:2)" or "at path:1:2".
_FRAME = re.compile(
    r"^\s*(?:\u276f|at)\s+"
    r"(?:(?P<func>[^()]*?)\s+\(|(?P<bare_func>[^\s()]+)\s+(?=[^\s()]+:\d))?"
    r"(?P<loc>[^()\s]+?:\d+(?::\d+)?)\)?\s*$"
)
# Vitest's separator line, a run of U+23AF.
_SEPARATOR = re.compile(r"^\s*\u23af+\s*$")
_WORKSPACE_IN_PATH = re.compile(r"^.*?/((?:backend|frontend|tools)/.*)$")
_TEST_FILE = re.compile(r"\.(?:test|spec)\.[cm]?[jt]sx?$")


class JUnitError(Exception):
    """A report could not be parsed (malformed, or rejected as unsafe)."""


@dataclass(frozen=True)
class CaseResult:
    report: str
    suite: str
    name: str
    file: str | None
    status: CaseStatus
    message: str
    stack: tuple[str, ...]
    duration_ms: int | None


@dataclass(frozen=True)
class ParsedReport:
    source: str
    cases: tuple[CaseResult, ...]


def parse_report(
    source: str, data: bytes, *, workspace: str | None, repo_root: str | None = None
) -> ParsedReport:
    """Parse one JUnit XML document.

    `workspace` ("backend"/"frontend") prefixes workspace-relative paths so
    they read as repo paths. `repo_root` is stripped from absolute paths.
    """
    try:
        root = fromstring(data, forbid_dtd=True)
    except DefusedXmlException as exc:
        raise JUnitError(f"{source}: rejected unsafe XML ({type(exc).__name__})") from exc
    except ParseError as exc:
        raise JUnitError(f"{source}: not valid XML ({exc})") from exc

    paths = _PathRewriter(workspace=workspace, repo_root=repo_root)
    suites = [root] if root.tag == "testsuite" else list(root.iter("testsuite"))
    cases: list[CaseResult] = []
    for suite in suites:
        suite_name = suite.get("name", "")
        for child in suite:
            if child.tag == "testcase":
                cases.append(_parse_case(source, suite_name, child, paths))
            elif child.tag in ("error", "failure"):
                cases.append(_suite_level_error(source, suite_name, child, paths))
    return ParsedReport(source=source, cases=tuple(cases))


def _parse_case(source: str, suite: str, case: Element, paths: "_PathRewriter") -> CaseResult:
    status: CaseStatus = "passed"
    message = ""
    stack: tuple[str, ...] = ()
    for child in case:
        if child.tag in ("failure", "error"):
            status = "failed" if child.tag == "failure" else "error"
            message, stack = _message_and_stack(child, paths)
            break
        if child.tag == "skipped":
            status = "skipped"
    return CaseResult(
        report=source,
        suite=suite,
        name=case.get("name", ""),
        file=paths.file_for(case.get("file") or case.get("classname")),
        status=status,
        message=message,
        stack=stack,
        duration_ms=_duration_ms(case.get("time")),
    )


def _suite_level_error(source: str, suite: str, element: Element, paths: "_PathRewriter") -> CaseResult:
    message, stack = _message_and_stack(element, paths)
    return CaseResult(
        report=source,
        suite=suite,
        name=SUITE_ERROR_NAME,
        file=paths.file_for(suite),
        status="error",
        message=message,
        stack=stack,
        duration_ms=None,
    )


def _message_and_stack(element: Element, paths: "_PathRewriter") -> tuple[str, tuple[str, ...]]:
    text_lines: list[str] = []
    frames: list[str] = []
    for line in (element.text or "").splitlines():
        match = _FRAME.match(line)
        if match:
            frame = paths.frame(match.group("func") or match.group("bare_func"), match.group("loc"))
            if frame is not None and len(frames) < MAX_STACK_FRAMES:
                frames.append(frame)
            continue
        if _SEPARATOR.match(line):
            continue
        text_lines.append(line.rstrip())
    message = "\n".join(text_lines).strip() or element.get("message", "")
    if len(message) > MAX_MESSAGE_CHARS:
        message = message[:MAX_MESSAGE_CHARS] + "…"
    return message, tuple(frames)


def _duration_ms(value: str | None) -> int | None:
    if value is None:
        return None
    try:
        return round(float(value) * 1000)
    except ValueError:
        return None


class _PathRewriter:
    """Turns paths in reports into repo-relative ones, and drops frames outside the repo."""

    def __init__(self, *, workspace: str | None, repo_root: str | None) -> None:
        self.workspace = workspace
        self.repo_root = repo_root.replace("\\", "/").rstrip("/") + "/" if repo_root else None

    def _repo_relative(self, path: str) -> str | None:
        path = path.replace("\\", "/").removeprefix("file://")
        if self.repo_root and path.casefold().startswith(self.repo_root.casefold()):
            return path[len(self.repo_root) :]
        if path.startswith("/") or re.match(r"^[A-Za-z]:/", path):
            match = _WORKSPACE_IN_PATH.match(path)
            return match.group(1) if match else None  # absolute and outside the repo
        if self.workspace and not path.startswith(f"{self.workspace}/"):
            return f"{self.workspace}/{path}"
        return path

    def file_for(self, value: str | None) -> str | None:
        """A test's file, if the attribute is a path (Jest classnames are sentences)."""
        if not value or not _TEST_FILE.search(value):
            return None
        return self._repo_relative(value)

    def frame(self, func: str | None, location: str) -> str | None:
        if "node_modules" in location or location.startswith("node:") or "<anonymous>" in location:
            return None
        relative = self._repo_relative(location)
        if relative is None:
            return None
        func = (func or "").strip()
        return f"{func} ({relative})" if func else relative


# --- Aggregation -------------------------------------------------------------


class _Raw(Protocol):
    @property
    def name(self) -> str: ...
    @property
    def data(self) -> bytes: ...


def parse_reports(raw: Iterable[_Raw], *, workspace: str | None, repo_root: str | None) -> list[ParsedReport]:
    return [parse_report(r.name, r.data, workspace=workspace, repo_root=repo_root) for r in raw]


def iter_cases(reports: Iterable[ParsedReport]) -> Iterable[CaseResult]:
    for report in reports:
        yield from report.cases


def to_failing_tests(reports: list[ParsedReport], *, max_failures: int = MAX_FAILURES) -> FailingTests:
    cases = list(iter_cases(reports))
    broken = [case for case in cases if case.status in ("failed", "error")]
    shown = broken[:max_failures]
    hidden = len(broken) - len(shown)
    return FailingTests(
        reports=[report.source for report in reports],
        total=len(cases),
        failed=sum(1 for case in cases if case.status == "failed"),
        skipped=sum(1 for case in cases if case.status == "skipped"),
        errors=sum(1 for case in cases if case.status == "error"),
        failures=[
            TestFailure(
                file=case.file,
                suite=case.suite,
                name=case.name,
                message=case.message,
                stack=list(case.stack),
                duration_ms=case.duration_ms,
            )
            for case in shown
        ],
        truncated=hidden > 0,
        hint=(
            f"{hidden} more failures not shown. Fix or rerun these first, or read the JUnit files directly."
            if hidden
            else None
        ),
    )


def summarize(result: FailingTests) -> str:
    head = (
        f"{result.total} tests: {result.failed} failed, {result.errors} errors, {result.skipped} skipped "
        f"(from {len(result.reports)} report(s))."
    )
    if not result.failures:
        return head
    lines = [head]
    for failure in result.failures[:5]:
        first = failure.message.splitlines()[0] if failure.message else ""
        lines.append(f"- {failure.file or failure.suite} > {failure.name}: {first}")
    if len(result.failures) > 5:
        lines.append(f"- … {len(result.failures) - 5} more in the structured result")
    return "\n".join(lines)
