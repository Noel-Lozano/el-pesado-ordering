from pathlib import Path
from typing import Any

import pytest

from pesado_debug.config import Settings
from pesado_debug.core import migrate, node_runner
from pesado_debug.core.migrate import BackendScriptError
from pesado_debug.core.node_runner import NodeResult
from pesado_debug.core.testdb import TestDbRefused


@pytest.fixture
def recorded(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    calls: list[dict[str, Any]] = []

    async def fake_run_node(
        args: list[str], *, cwd: Path, env: dict[str, str], timeout_s: float
    ) -> NodeResult:
        empty = Path(env["DOTENV_CONFIG_PATH"])
        contents = empty.read_text(encoding="utf-8")  # noqa: ASYNC240 - tiny temp file in a test double
        calls.append({"args": args, "cwd": cwd, "env": env, "empty_contents": contents})
        return NodeResult(0, "Migrations complete!", "", timed_out=False)

    monkeypatch.setattr(node_runner, "run_node", fake_run_node)
    return calls


async def test_refuses_remote_host_before_starting_node(
    clean_env: pytest.MonkeyPatch, recorded: list[dict[str, Any]]
) -> None:
    clean_env.setenv("PESADO_TEST_DATABASE_URL", "postgresql://u:p@db.prod.example/postgres")
    with pytest.raises(TestDbRefused):
        await migrate.migrate_test_db(Settings(_env_file=None))
    assert recorded == []


async def test_runs_node_pg_migrate_with_empty_env_path(
    clean_env: pytest.MonkeyPatch, recorded: list[dict[str, Any]]
) -> None:
    url = "postgresql://postgres:postgres@127.0.0.1:54329/pesado_test"
    clean_env.setenv("PESADO_TEST_DATABASE_URL", url)
    clean_env.setenv("DATABASE_URL", "postgres://prod/should-not-be-used")
    run = await migrate.migrate_test_db(Settings(_env_file=None))
    (call,) = recorded
    args = call["args"]
    assert Path(args[0]) == migrate.NODE_PG_MIGRATE
    assert args[1] == "up"
    assert args[2] == "--envPath"
    assert Path(args[3]) == Path(call["env"]["DOTENV_CONFIG_PATH"])
    assert call["empty_contents"] == ""
    assert call["env"]["DATABASE_URL"] == url
    assert call["cwd"].name == "backend"
    assert str(run.target) == "127.0.0.1:54329/pesado_test"


async def test_does_not_check_the_marker(
    clean_env: pytest.MonkeyPatch, recorded: list[dict[str, Any]], monkeypatch: pytest.MonkeyPatch
) -> None:
    """A fresh database has no marker yet: migrate-test-db never connects itself."""
    from pesado_debug.core import testdb

    def no_connect(url: str) -> None:
        raise AssertionError("migrate-test-db must not connect")

    monkeypatch.setattr(testdb, "_connect", no_connect)
    clean_env.setenv("PESADO_TEST_DATABASE_URL", "postgresql://u:p@localhost/pesado_test")
    await migrate.migrate_test_db(Settings(_env_file=None))
    assert len(recorded) == 1


async def test_failure_is_reported_with_output(
    clean_env: pytest.MonkeyPatch, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def failing(args: list[str], *, cwd: Path, env: dict[str, str], timeout_s: float) -> NodeResult:
        return NodeResult(1, "", "relation already exists", timed_out=False)

    monkeypatch.setattr(node_runner, "run_node", failing)
    clean_env.setenv("PESADO_TEST_DATABASE_URL", "postgresql://u:p@localhost/pesado_test")
    with pytest.raises(BackendScriptError, match="relation already exists"):
        await migrate.migrate_test_db(Settings(_env_file=None))
