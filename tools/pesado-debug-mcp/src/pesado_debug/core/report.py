"""A folder of JUnit XML -> a markdown test report for the GitHub job summary (ADR-007).

Uses the same junit.py parser as get_failing_tests. Test names and messages
come from test output, so they are untrusted:

- Inline text (table cells, the <summary> line) is HTML-escaped, and the
  characters markdown or tables treat specially (| ` * _ [ ] \\) become
  numeric entities. Entities read as literal characters both inside HTML
  (<summary>) and in markdown table cells, where a backslash escape would
  show up as a backslash.
- Messages and stacks go in fenced code blocks whose fence is longer than
  any run of backticks in the text, so the text can't close the block.
"""

import html
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from pesado_debug.core import junit
from pesado_debug.core.junit import CaseResult, JUnitError

MAX_FAILURES: Final = 25
MAX_REPORTS: Final = 100
MAX_REPORT_BYTES: Final = 10 * 1024 * 1024

_INLINE_ENTITIES: Final = {
    "|": "&#124;",
    "`": "&#96;",
    "*": "&#42;",
    "_": "&#95;",
    "[": "&#91;",
    "]": "&#93;",
    "\\": "&#92;",
}
_BACKTICK_RUN: Final = re.compile(r"`+")
_PLAIN_URL: Final = re.compile(r"^https://[A-Za-z0-9./_~%-]+$")


def escape_inline(text: str) -> str:
    """Safe inside a table cell or an HTML tag: no markup, no table splits, one line."""
    escaped = html.escape(" ".join(text.split()), quote=True)
    return "".join(_INLINE_ENTITIES.get(char, char) for char in escaped)


def code_block(text: str, language: str = "text") -> str:
    longest = max((len(run) for run in _BACKTICK_RUN.findall(text)), default=0)
    fence = "`" * max(3, longest + 1)
    return f"{fence}{language}\n{text.rstrip()}\n{fence}"


@dataclass(frozen=True)
class SuiteRow:
    label: str
    passed: int
    failed: int
    skipped: int

    @property
    def pass_rate(self) -> str:
        ran = self.passed + self.failed
        return "n/a" if ran == 0 else f"{self.passed / ran:.1%}".replace(".0%", "%")


def suite_label(path: Path, root: Path) -> tuple[str, str | None]:
    """("backend (integration)", "backend") from junit-backend/junit-integration.xml."""
    relative = path.relative_to(root)
    workspace = None
    folder = relative.parent.name if relative.parent != Path(".") else ""
    if folder.startswith("junit-"):
        workspace = folder.removeprefix("junit-")
    kind = path.stem.removeprefix("junit-")
    if workspace:
        return f"{workspace} ({kind})", workspace
    return relative.as_posix(), None


def _find_reports(root: Path) -> list[Path]:
    if not root.is_dir():
        return []
    return sorted(p for p in root.rglob("*.xml") if p.is_file())[:MAX_REPORTS]


def build_report(root: Path, *, title: str | None = None, run_url: str | None = None) -> str:
    rows: list[SuiteRow] = []
    failures: list[CaseResult] = []
    problems: list[str] = []
    for path in _find_reports(root):
        label, workspace = suite_label(path, root)
        if path.stat().st_size > MAX_REPORT_BYTES:
            problems.append(f"{label}: report is over {MAX_REPORT_BYTES} bytes; skipped")
            continue
        try:
            parsed = junit.parse_report(label, path.read_bytes(), workspace=workspace)
        except JUnitError as exc:
            problems.append(str(exc))
            continue
        statuses = [case.status for case in parsed.cases]
        rows.append(
            SuiteRow(
                label=label,
                passed=statuses.count("passed"),
                failed=statuses.count("failed") + statuses.count("error"),
                skipped=statuses.count("skipped"),
            )
        )
        failures += [case for case in parsed.cases if case.status in ("failed", "error")]

    prefix = f"{escape_inline(title)}: " if title else ""
    lines: list[str] = []
    if not rows:
        lines.append(f"### {prefix}⚠️ No test results")
        lines.append("")
        lines.append("No test results were produced: the run failed before tests ran. See the failing job:")
        if not run_url:
            lines.append("(no run URL given)")
        else:
            # A plain https URL stays as-is so GitHub links it; anything else is escaped.
            lines.append(run_url if _PLAIN_URL.match(run_url) else escape_inline(run_url))
    else:
        total_passed = sum(row.passed for row in rows)
        if failures:
            noun = "test" if len(failures) == 1 else "tests"
            lines.append(f"### {prefix}🔴 CI failed: {len(failures)} failing {noun}")
        else:
            lines.append(f"### {prefix}✅ All {total_passed} tests passed")
        lines += ["", "| Suite | Passed | Failed | Skipped | Pass rate |", "|---|---|---|---|---|"]
        lines += [
            f"| {escape_inline(r.label)} | {r.passed} | {r.failed} | {r.skipped} | {r.pass_rate} |"
            for r in rows
        ]
        if failures:
            lines += ["", "**Failing tests**", ""]
            for case in failures[:MAX_FAILURES]:
                lines += _failure_block(case)
            if len(failures) > MAX_FAILURES:
                lines.append(f"+{len(failures) - MAX_FAILURES} more: see the `junit-*` artifacts.")
                lines.append("")
    if problems:
        lines += ["", "**Reports that couldn't be read**", ""]
        lines += [f"- {escape_inline(problem)}" for problem in problems]
    return "\n".join(lines).rstrip() + "\n"


def _failure_block(case: CaseResult) -> list[str]:
    where = case.file or case.suite
    first = case.message.splitlines()[0] if case.message else "(no message)"
    summary = f"<code>{escape_inline(where)}</code>: {escape_inline(case.name)}: {escape_inline(first)}"
    body = case.message or "(no message)"
    if case.stack:
        body += "\n\n" + "\n".join(case.stack)
    return ["<details>", f"<summary>{summary}</summary>", "", code_block(body), "", "</details>", ""]


def append_report(markdown: str, out: Path) -> None:
    """Append, never overwrite: $GITHUB_STEP_SUMMARY may already have content."""
    # newline="\n": the same bytes on every OS (Windows text mode would write CRLF).
    with out.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(markdown)
