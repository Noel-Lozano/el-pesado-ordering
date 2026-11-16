"""Cleaning and trimming GitHub Actions job logs to fit an agent's context.

A raw job log is every step's output, each line prefixed with a timestamp and
often colored with ANSI codes. What an agent needs is the failing step and its
`##[error]` lines, within a fixed character budget.
"""

import re
from dataclasses import dataclass

MAX_LOG_CHARS = 20_000
MAX_TAIL_LINES = 1_000

_ANSI = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]")
_TIMESTAMP = re.compile(r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z ?")
_GROUP = "##[group]"
_ENDGROUP = "##[endgroup]"
_ERROR = "##[error]"
_POST_JOB = "Post job cleanup."


@dataclass(frozen=True)
class LogExtract:
    lines: list[str]
    truncated: bool
    hint: str | None


def clean(text: str) -> list[str]:
    """Strip the BOM, ANSI escape codes, timestamps and `##[endgroup]` markers."""
    lines: list[str] = []
    for raw in text.lstrip("\ufeff").splitlines():
        line = _TIMESTAMP.sub("", _ANSI.sub("", raw)).rstrip()
        if line == _ENDGROUP:
            continue
        lines.append(line)
    return lines


def failed_step_bounds(lines: list[str]) -> tuple[int, int]:
    """[start, end) of the failed step: from the last `##[group]` before the first
    `##[error]` up to (not including) the next step.

    The next step starts at the next `##[group]` (an `if: always()` step such as an
    artifact upload) or at "Post job cleanup.". Step names ("Typecheck") and group
    titles ("Run npm run typecheck") don't match, so the cut is anchored on the
    first error, not on the step name. Without an error, the whole log.
    """
    first_error = next((i for i, line in enumerate(lines) if line.startswith(_ERROR)), None)
    if first_error is None:
        return 0, len(lines)
    start = 0
    for i in range(first_error, -1, -1):
        if lines[i].startswith(_GROUP):
            start = i
            break
    end = len(lines)
    for i in range(first_error + 1, len(lines)):
        if lines[i].startswith(_GROUP) or lines[i] == _POST_JOB:
            end = i
            break
    return start, end


def slice_failed_step(lines: list[str]) -> list[str]:
    start, end = failed_step_bounds(lines)
    return lines[start:end]


def extract(text: str, *, tail_lines: int, grep: str | None, max_chars: int) -> LogExtract:
    """Clean, select, tail and cap a log.

    - Without `grep`: only the failed step's section, plus `##[error]` lines from
      other steps.
    - With `grep`: matching lines from the whole log (case-insensitive substring).
    `##[error]` lines are kept even when they fall before the tail.
    """
    lines = clean(text)
    if grep:
        needle = grep.casefold()
        selected = [line for line in lines if needle in line.casefold() or line.startswith(_ERROR)]
    else:
        start, end = failed_step_bounds(lines)
        section = lines[start:end]
        other_errors = [
            line for i, line in enumerate(lines) if line.startswith(_ERROR) and not start <= i < end
        ]
        selected = [*section, "… errors elsewhere in this job:", *other_errors] if other_errors else section

    hints: list[str] = []
    truncated = False

    tail = selected[-tail_lines:] if tail_lines < len(selected) else selected
    omitted = len(selected) - len(tail)
    if omitted:
        truncated = True
        early_errors = [line for line in selected[:omitted] if line.startswith(_ERROR)]
        tail = [*early_errors, f"… {omitted - len(early_errors)} earlier lines omitted …", *tail]
        hints.append(f"raise tail_lines (max {MAX_TAIL_LINES}) or narrow with grep")

    capped = _cap_chars(tail, max_chars)
    if capped != tail:
        truncated = True
        hints.append("narrow with grep, or pass job_name to read one job")

    return LogExtract(lines=capped, truncated=truncated, hint="; ".join(hints) or None)


def _cap_chars(lines: list[str], max_chars: int) -> list[str]:
    """Keep the end of the log (where failures are), dropping from the front."""
    if max_chars <= 0:
        return []
    kept: list[str] = []
    used = 0
    for line in reversed(lines):
        cost = len(line) + 1
        if used + cost > max_chars:
            room = max_chars - used - 1
            if not kept and room > 0:
                # A single huge line: keep its end.
                kept.append("…" + line[-room:])
            break
        kept.append(line)
        used += cost
    kept.reverse()
    return kept
