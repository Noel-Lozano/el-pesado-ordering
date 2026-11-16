"""rerun_test: run one Vitest file N times and call it deterministic, flaky, or passing.

Threat model (ADR-007):
- `workspace` maps to a directory through a fixed dict; `file` must resolve
  (following symlinks and junctions) inside <workspace>/src/test and match
  `.test|.spec .ts|.tsx`. Anything else is refused before Node starts.
- `test_name` is re.escape'd before it goes to `-t`.
- Node starts through node_runner: `node vitest.mjs` directly, an argument
  list, a cleaned env, a 60 s timeout that kills the process tree.
- Unit files get an unreachable placeholder DATABASE_URL, never a real one.
- Integration files (backend/src/test/integration) run only after all three
  DB locks pass, against CI's state: truncate public, then seed:menu.
- Each run writes JUnit to a temp file, parsed by the same junit.py.
"""

import asyncio
import os
import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Literal

from pesado_debug.config import Settings
from pesado_debug.core import junit, migrate, node_runner, testdb
from pesado_debug.models import RerunResult

Workspace = Literal["backend", "frontend"]
Verdict = Literal["deterministic_fail", "flaky", "passes_locally"]

WORKSPACE_DIRS: Final[dict[Workspace, str]] = {"backend": "backend", "frontend": "frontend"}
VITEST_CONFIGS: Final[dict[Workspace, str]] = {"backend": "vitest.config.ts", "frontend": "vitest.config.mts"}
INTEGRATION_CONFIG: Final = "vitest.integration.config.ts"
VITEST_ENTRY: Final = Path("node_modules/vitest/vitest.mjs")
TEST_FILE: Final = re.compile(r"\.(test|spec)\.tsx?$")
RUN_TIMEOUT_S: Final = 60.0
MAX_TIMES: Final = 10
MAX_MESSAGES: Final = 10
MAX_MESSAGE_CHARS: Final = 500
# Unit tests never get a real database: port 9 (discard) on loopback, a name that says why.
UNIT_TEST_DATABASE_URL: Final = "postgresql://unit-tests-have-no-database@127.0.0.1:9/none"


class RerunError(Exception):
    """The rerun couldn't run, or its result can't be trusted."""


@dataclass(frozen=True)
class TestTarget:
    __test__ = False  # not a pytest test class

    workspace_dir: Path
    path: Path
    relative: str  # posix, relative to the workspace
    is_integration: bool


def resolve_test_file(repo_root: Path, workspace: Workspace, file: str) -> TestTarget:
    workspace_dir = (repo_root / WORKSPACE_DIRS[workspace]).resolve()
    test_root = workspace_dir / "src" / "test"
    if "\x00" in file:
        raise RerunError("file contains a NUL byte")
    candidate = Path(file)
    if not candidate.is_absolute():
        candidate = workspace_dir / candidate
    try:
        resolved = candidate.resolve(strict=True)
    except (OSError, RuntimeError) as exc:
        raise RerunError(f"{file!r} does not exist in {workspace}/") from exc
    if not resolved.is_relative_to(test_root):
        raise RerunError(f"{file!r} is not inside {workspace}/src/test/ (after resolving links); refusing.")
    if not resolved.is_file():
        raise RerunError(f"{file!r} is not a file")
    if not TEST_FILE.search(resolved.name):
        raise RerunError(f"{file!r} is not a test file (*.test.ts, *.test.tsx, *.spec.ts, *.spec.tsx)")
    return TestTarget(
        workspace_dir=workspace_dir,
        path=resolved,
        relative=resolved.relative_to(workspace_dir).as_posix(),
        is_integration=workspace == "backend" and resolved.is_relative_to(test_root / "integration"),
    )


def name_pattern(test_name: str) -> str:
    """A literal match for `-t`.

    Vitest 5 matches -t against the full name joined with " > ", the same form
    its JUnit reporter (and so get_failing_tests) uses, so the name passes
    through as-is. Checked against Vitest 5.0.5: "computeOrderTotal > sums ..."
    matches; "computeOrderTotal sums ..." matches nothing.
    """
    return re.escape(test_name)


def vitest_args(
    target: TestTarget, workspace: Workspace, junit_out: Path, test_name: str | None
) -> list[str]:
    config = INTEGRATION_CONFIG if target.is_integration else VITEST_CONFIGS[workspace]
    args = [
        str(VITEST_ENTRY),
        "run",
        target.relative,
        "--config",
        config,
        "--reporter=junit",
        f"--outputFile.junit={junit_out}",
    ]
    if test_name:
        args += ["-t", name_pattern(test_name)]
    return args


def verdict(passes: int, fails: int) -> Verdict:
    if fails == 0:
        return "passes_locally"
    if passes == 0:
        return "deterministic_fail"
    return "flaky"


@dataclass(frozen=True)
class RunOutcome:
    passed: bool
    timed_out: bool
    messages: tuple[str, ...]


def outcome_from_run(result: node_runner.NodeResult, junit_out: Path) -> RunOutcome:
    if result.timed_out:
        return RunOutcome(False, True, (f"timed out after {RUN_TIMEOUT_S:.0f} s",))
    if not junit_out.is_file():
        raise RerunError(
            f"Vitest produced no report (exit {result.returncode}).\n{result.output_tail(2_000)}"
        )
    report = junit.parse_report(junit_out.name, junit_out.read_bytes(), workspace=None)
    executed = [case for case in report.cases if case.status != "skipped"]
    if not executed:
        raise RerunError(
            "No test matched: check `file` and `test_name` (no test ran, so this is not a pass)."
        )
    broken = [case for case in executed if case.status in ("failed", "error")]
    messages = tuple(
        f"{case.name}: {case.message.splitlines()[0] if case.message else '(no message)'}"[:MAX_MESSAGE_CHARS]
        for case in broken
    )
    return RunOutcome(passed=not broken, timed_out=False, messages=messages)


PrepareDb = Callable[[Settings], Awaitable[str]]


async def prepare_integration_db(settings: Settings) -> str:
    """Locks 1-3, truncate public (no baseline), then seed:menu: the state CI runs integration tests in."""
    url = await asyncio.to_thread(testdb.truncate_for_rerun, settings)
    await migrate.seed_menu(settings, url)
    return url


async def rerun_test(
    settings: Settings,
    *,
    workspace: Workspace,
    file: str,
    test_name: str | None,
    times: int,
    prepare_db: PrepareDb = prepare_integration_db,
) -> RerunResult:
    times = max(1, min(times, MAX_TIMES))
    target = resolve_test_file(settings.pesado_repo_root, workspace, file)
    if not (target.workspace_dir / VITEST_ENTRY).is_file():
        raise RerunError(f"{workspace}/{VITEST_ENTRY} is missing. Run `npm ci` in {workspace}/ first.")

    notes: list[str] = []
    database_url = UNIT_TEST_DATABASE_URL
    db_prepared: Literal["none", "reset+seed:menu"] = "none"
    if target.is_integration:
        database_url = await prepare_db(settings)
        db_prepared = "reset+seed:menu"
        notes.append("The test DB was reset and filled by seed:menu first; any scenario data is gone.")

    passes = fails = timed_out = 0
    messages: list[str] = []
    with node_runner.temp_dir() as tmp:
        tmp_dir = Path(tmp)
        env = node_runner.build_child_env(
            os.environ,
            test_db_url=database_url,
            env_example=settings.pesado_repo_root / "backend" / ".env.example",
            empty_env_file=node_runner.empty_env_file(tmp_dir),
        )
        for run in range(times):
            junit_out = tmp_dir / f"run-{run}.xml"
            result = await node_runner.run_node(
                vitest_args(target, workspace, junit_out, test_name),
                cwd=target.workspace_dir,
                env=env,
                timeout_s=RUN_TIMEOUT_S,
            )
            outcome = outcome_from_run(result, junit_out)
            if outcome.passed:
                passes += 1
            else:
                fails += 1
                timed_out += int(outcome.timed_out)
                messages += [m for m in outcome.messages if m not in messages]

    return RerunResult(
        file=f"{workspace}/{target.relative}",
        test_name=test_name,
        times=times,
        passes=passes,
        fails=fails,
        verdict=verdict(passes, fails),
        failure_messages=messages[:MAX_MESSAGES],
        timed_out_runs=timed_out,
        db_prepared=db_prepared,
        notes=notes,
    )


def summarize(result: RerunResult) -> str:
    name = f" > {result.test_name}" if result.test_name else ""
    head = f"{result.verdict}: {result.file}{name} passed {result.passes}/{result.times}"
    if result.timed_out_runs:
        head += f" ({result.timed_out_runs} timed out)"
    if result.failure_messages:
        head += f"\nFirst failure: {result.failure_messages[0]}"
    return head
