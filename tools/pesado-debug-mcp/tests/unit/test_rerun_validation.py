"""rerun_test's input validation, command line, environment and integration prep."""

import os
import re
from pathlib import Path
from typing import Any

import pytest

from pesado_debug.config import Settings
from pesado_debug.core import node_runner, rerun
from pesado_debug.core.node_runner import NodeResult
from pesado_debug.core.rerun import RerunError

PASSING_REPORT = (
    '<testsuites><testsuite name="s"><testcase classname="c" name="adds lines"/></testsuite></testsuites>'
)
FAILING_REPORT = (
    '<testsuites><testsuite name="s"><testcase classname="c" name="adds lines">'
    '<failure message="expected 1 to be 2">AssertionError: expected 1 to be 2</failure>'
    "</testcase></testsuite></testsuites>"
)
SKIPPED_REPORT = (
    '<testsuites><testsuite name="s"><testcase classname="c" name="x"><skipped/></testcase>'
    "</testsuite></testsuites>"
)


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    for workspace in ("backend", "frontend"):
        (tmp_path / workspace / "node_modules" / "vitest").mkdir(parents=True)
        (tmp_path / workspace / "node_modules" / "vitest" / "vitest.mjs").write_text("", encoding="utf-8")
        (tmp_path / workspace / "src" / "test" / "unit" / "lib").mkdir(parents=True)
        (tmp_path / workspace / "src" / "lib").mkdir(parents=True)
    (tmp_path / "backend" / "src" / "test" / "integration" / "routes").mkdir(parents=True)
    (tmp_path / "backend" / "src" / "test" / "unit" / "lib" / "pricing.test.ts").write_text(
        "", encoding="utf-8"
    )
    (tmp_path / "backend" / "src" / "test" / "integration" / "routes" / "orders.test.ts").write_text(
        "", encoding="utf-8"
    )
    (tmp_path / "backend" / "src" / "lib" / "pricing.ts").write_text("", encoding="utf-8")
    (tmp_path / "backend" / "src" / "test" / "unit" / "lib" / "helpers.ts").write_text("", encoding="utf-8")
    (tmp_path / "backend" / ".env.example").write_text(
        "NODE_ENV=\nDATABASE_URL=\nJWT_SECRET=\n# STRIPE_SECRET_KEY=\n", encoding="utf-8"
    )
    (tmp_path / "frontend" / "src" / "test" / "unit" / "Stepper.test.tsx").write_text("", encoding="utf-8")
    return tmp_path


@pytest.fixture
def settings(clean_env: pytest.MonkeyPatch, repo: Path) -> Settings:
    clean_env.setenv("PESADO_REPO_ROOT", str(repo))
    return Settings(_env_file=None)


# --- Path validation -------------------------------------------------------------


def test_relative_test_file_resolves(repo: Path) -> None:
    target = rerun.resolve_test_file(repo, "backend", "src/test/unit/lib/pricing.test.ts")
    assert target.relative == "src/test/unit/lib/pricing.test.ts"
    assert not target.is_integration


def test_integration_file_is_detected(repo: Path) -> None:
    assert rerun.resolve_test_file(
        repo, "backend", "src/test/integration/routes/orders.test.ts"
    ).is_integration


def test_tsx_in_frontend(repo: Path) -> None:
    target = rerun.resolve_test_file(repo, "frontend", "src/test/unit/Stepper.test.tsx")
    assert target.relative == "src/test/unit/Stepper.test.tsx"


@pytest.mark.parametrize(
    ("file", "reason"),
    [
        ("../frontend/src/test/unit/Stepper.test.tsx", "not inside backend/src/test"),
        ("src/test/../../../frontend/src/test/unit/Stepper.test.tsx", "not inside backend/src/test"),
        ("src/lib/pricing.ts", "not inside backend/src/test"),
        ("src/test/unit/lib/helpers.ts", "not a test file"),
        ("src/test/unit/lib/missing.test.ts", "does not exist"),
        ("src/test/unit/lib", "not a file"),
        ("src/test/unit/lib/pricing.test.ts\x00.sh", "NUL"),
    ],
)
def test_bad_paths_are_refused(repo: Path, file: str, reason: str) -> None:
    with pytest.raises(RerunError, match=reason):
        rerun.resolve_test_file(repo, "backend", file)


def test_absolute_path_outside_the_repo_is_refused(
    repo: Path, tmp_path_factory: pytest.TempPathFactory
) -> None:
    outside = tmp_path_factory.mktemp("outside") / "evil.test.ts"
    outside.write_text("", encoding="utf-8")
    with pytest.raises(RerunError, match="not inside"):
        rerun.resolve_test_file(repo, "backend", str(outside))


def test_symlink_escaping_the_workspace_is_refused(
    repo: Path, tmp_path_factory: pytest.TempPathFactory
) -> None:
    outside = tmp_path_factory.mktemp("outside") / "evil.test.ts"
    outside.write_text("", encoding="utf-8")
    link = repo / "backend" / "src" / "test" / "unit" / "link.test.ts"
    try:
        os.symlink(outside, link)
    except OSError:
        pytest.skip("symlinks need extra privileges on this OS")
    with pytest.raises(RerunError, match="after resolving links"):
        rerun.resolve_test_file(repo, "backend", "src/test/unit/link.test.ts")


# --- Command line -------------------------------------------------------------------


def test_test_name_is_escaped_and_uses_spaces() -> None:
    pattern = rerun.name_pattern("pricing > rounds (1.5) centavos* $(rm -rf /)")
    assert re.fullmatch(pattern, "pricing rounds (1.5) centavos* $(rm -rf /)")
    assert not re.fullmatch(pattern, "pricing rounds X1Y5Z centavos")


def test_args_pick_the_right_config(repo: Path, tmp_path: Path) -> None:
    unit = rerun.resolve_test_file(repo, "backend", "src/test/unit/lib/pricing.test.ts")
    integration = rerun.resolve_test_file(repo, "backend", "src/test/integration/routes/orders.test.ts")
    frontend = rerun.resolve_test_file(repo, "frontend", "src/test/unit/Stepper.test.tsx")
    out = tmp_path / "r.xml"
    assert rerun.vitest_args(unit, "backend", out, None)[:5] == [
        str(rerun.VITEST_ENTRY),
        "run",
        "src/test/unit/lib/pricing.test.ts",
        "--config",
        "vitest.config.ts",
    ]
    assert "vitest.integration.config.ts" in rerun.vitest_args(integration, "backend", out, None)
    assert "vitest.config.mts" in rerun.vitest_args(frontend, "frontend", out, None)
    args = rerun.vitest_args(unit, "backend", out, "a > b")
    assert args[-2:] == ["-t", rerun.name_pattern("a > b")]
    assert not any(token in ("npm", "npx", "sh", "cmd", "cmd.exe") for token in args)


# --- Running (Node replaced by a fake) ----------------------------------------


class FakeVitest:
    """Writes a JUnit file per run, from a script of outcomes, and records each call."""

    def __init__(self, outcomes: list[str]) -> None:
        self.outcomes = outcomes
        self.calls: list[dict[str, Any]] = []

    async def __call__(
        self, args: list[str], *, cwd: Path, env: dict[str, str], timeout_s: float
    ) -> NodeResult:
        self.calls.append({"args": args, "cwd": cwd, "env": env})
        outcome = self.outcomes[len(self.calls) - 1]
        if outcome == "timeout":
            return NodeResult(None, "", "", timed_out=True)
        out = Path(next(a for a in args if a.startswith("--outputFile.junit=")).split("=", 1)[1])
        if outcome != "no-report":
            xml = {"pass": PASSING_REPORT, "fail": FAILING_REPORT, "skipped": SKIPPED_REPORT}[outcome]
            out.write_text(xml, encoding="utf-8")  # noqa: ASYNC240 - test double writing a temp file
        return NodeResult(0 if outcome == "pass" else 1, "", "boom" if outcome == "no-report" else "", False)


def _install(monkeypatch: pytest.MonkeyPatch, outcomes: list[str]) -> FakeVitest:
    fake = FakeVitest(outcomes)
    monkeypatch.setattr(node_runner, "run_node", fake)
    return fake


async def _no_prepare(settings: Settings) -> str:
    raise AssertionError("unit files must not prepare the database")


async def test_unit_file_mixed_runs_are_flaky(settings: Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _install(monkeypatch, ["pass", "fail", "pass", "timeout", "fail"])
    result = await rerun.rerun_test(
        settings,
        workspace="backend",
        file="src/test/unit/lib/pricing.test.ts",
        test_name=None,
        times=5,
        prepare_db=_no_prepare,
    )
    assert (result.passes, result.fails, result.timed_out_runs) == (2, 3, 1)
    assert result.verdict == "flaky"
    assert result.db_prepared == "none"
    assert result.failure_messages == [
        "adds lines: AssertionError: expected 1 to be 2",
        "timed out after 60 s",
    ]
    env = fake.calls[0]["env"]
    assert env["DATABASE_URL"] == rerun.UNIT_TEST_DATABASE_URL
    assert "DOTENV_CONFIG_PATH" in env
    assert all(call["cwd"] == settings.pesado_repo_root / "backend" for call in fake.calls)


async def test_integration_file_prepares_the_db_exactly_once(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = _install(monkeypatch, ["pass", "pass", "pass"])
    prepared: list[str] = []

    async def prepare(s: Settings) -> str:
        prepared.append("x")
        return "postgresql://postgres:postgres@127.0.0.1:54329/pesado_test"

    result = await rerun.rerun_test(
        settings,
        workspace="backend",
        file="src/test/integration/routes/orders.test.ts",
        test_name=None,
        times=3,
        prepare_db=prepare,
    )
    assert prepared == ["x"]
    assert result.db_prepared == "reset+seed:menu"
    assert result.verdict == "passes_locally"
    assert result.notes and "scenario data is gone" in result.notes[0]
    assert {call["env"]["DATABASE_URL"] for call in fake.calls} == {
        "postgresql://postgres:postgres@127.0.0.1:54329/pesado_test"
    }


async def test_all_failures_are_deterministic(settings: Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    _install(monkeypatch, ["fail", "fail"])
    result = await rerun.rerun_test(
        settings,
        workspace="backend",
        file="src/test/unit/lib/pricing.test.ts",
        test_name="adds lines",
        times=2,
        prepare_db=_no_prepare,
    )
    assert result.verdict == "deterministic_fail"
    assert result.failure_messages == ["adds lines: AssertionError: expected 1 to be 2"]  # deduplicated


async def test_zero_executed_tests_is_an_error_not_a_pass(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    _install(monkeypatch, ["skipped"])
    with pytest.raises(RerunError, match="No test matched"):
        await rerun.rerun_test(
            settings,
            workspace="backend",
            file="src/test/unit/lib/pricing.test.ts",
            test_name="nope",
            times=1,
            prepare_db=_no_prepare,
        )


async def test_missing_report_is_an_error(settings: Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    _install(monkeypatch, ["no-report"])
    with pytest.raises(RerunError, match="no report"):
        await rerun.rerun_test(
            settings,
            workspace="backend",
            file="src/test/unit/lib/pricing.test.ts",
            test_name=None,
            times=1,
            prepare_db=_no_prepare,
        )


async def test_bad_path_never_starts_node(settings: Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _install(monkeypatch, [])
    with pytest.raises(RerunError):
        await rerun.rerun_test(
            settings,
            workspace="backend",
            file="../frontend/src/test/unit/Stepper.test.tsx",
            test_name=None,
            times=1,
            prepare_db=_no_prepare,
        )
    assert fake.calls == []


async def test_integration_prep_refuses_unmarked_or_remote_db(
    clean_env: pytest.MonkeyPatch, repo: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The real prep runs the locks before anything else."""
    from pesado_debug.core.testdb import TestDbRefused

    fake = _install(monkeypatch, [])
    clean_env.setenv("PESADO_REPO_ROOT", str(repo))
    clean_env.setenv("PESADO_TEST_DATABASE_URL", "postgresql://u:p@db.prod.example/postgres")
    with pytest.raises(TestDbRefused):
        await rerun.rerun_test(
            Settings(_env_file=None),
            workspace="backend",
            file="src/test/integration/routes/orders.test.ts",
            test_name=None,
            times=1,
        )
    assert fake.calls == []
