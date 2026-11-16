import os
import sys
from pathlib import Path

import pytest

from pesado_debug.config import DEFAULT_REPO_ROOT
from pesado_debug.core import node_runner
from pesado_debug.core.node_runner import NodeRunnerError

REAL_ENV_EXAMPLE = DEFAULT_REPO_ROOT / "backend" / ".env.example"
TEST_URL = "postgresql://postgres:postgres@127.0.0.1:54329/pesado_test"

PARENT_ENV = {
    "PATH": "/usr/bin",
    "DATABASE_URL": "postgres://prod:secret@db.prod.example/postgres",
    "GITHUB_TOKEN": "ghp_secret",
    "PESADO_TEST_DATABASE_URL": TEST_URL,
    "TWILIO_AUTH_TOKEN": "real-twilio-secret",
    "JWT_SECRET": "real-jwt-secret",
    "STRIPE_SECRET_KEY": "sk_live_real",
    "SUPABASE_SERVICE_ROLE_KEY": "real-service-role",
}


def _env(tmp_path: Path, env_example: Path = REAL_ENV_EXAMPLE) -> dict[str, str]:
    return node_runner.build_child_env(
        PARENT_ENV, test_db_url=TEST_URL, env_example=env_example, empty_env_file=tmp_path / "empty.env"
    )


def _runnable_env(tmp_path: Path) -> dict[str, str]:
    """The real environment (Windows needs SystemRoot etc. to start a process) plus planted secrets."""
    (tmp_path / "empty.env").write_text("", encoding="utf-8")
    return node_runner.build_child_env(
        {**os.environ, **PARENT_ENV, "PATH": os.environ.get("PATH", "")},
        test_db_url=TEST_URL,
        env_example=REAL_ENV_EXAMPLE,
        empty_env_file=tmp_path / "empty.env",
    )


def test_every_env_example_key_gets_a_placeholder(tmp_path: Path) -> None:
    """Parses the real backend/.env.example: a new key without a placeholder fails here."""
    active, _ = node_runner.env_example_keys(REAL_ENV_EXAMPLE)
    env = _env(tmp_path)
    assert active, "backend/.env.example has no keys?"
    for key in active:
        assert key in env, key
    assert env["DATABASE_URL"] == TEST_URL


def test_real_secrets_never_reach_the_child(tmp_path: Path) -> None:
    env = _env(tmp_path)
    values = set(env.values())
    for secret in (
        "ghp_secret",
        "real-twilio-secret",
        "real-jwt-secret",
        "sk_live_real",
        "real-service-role",
    ):
        assert secret not in values
    assert "GITHUB_TOKEN" not in env
    assert not any(key.startswith("PESADO_") for key in env)
    assert "STRIPE_SECRET_KEY" not in env  # commented out in .env.example: absent, not empty
    assert env["DOTENV_CONFIG_PATH"] == str(tmp_path / "empty.env")
    assert env["PATH"] == "/usr/bin"


def test_unknown_env_example_key_refuses(tmp_path: Path) -> None:
    example = tmp_path / ".env.example"
    example.write_text("DATABASE_URL=\nNEW_SECRET=\n# STRIPE_SECRET_KEY=\n", encoding="utf-8")
    with pytest.raises(NodeRunnerError, match="NEW_SECRET"):
        _env(tmp_path, example)


def test_env_example_parsing(tmp_path: Path) -> None:
    example = tmp_path / ".env.example"
    example.write_text("# comment\nA=1\n  B = 2\n# C=3\n#not a key\n", encoding="utf-8")
    assert node_runner.env_example_keys(example) == (["A", "B"], ["C"])


async def test_run_node_captures_output_and_exit_code(tmp_path: Path) -> None:
    script = tmp_path / "hello.mjs"
    script.write_text("console.log('hi'); console.error('err'); process.exit(3);\n", encoding="utf-8")
    result = await node_runner.run_node(
        [str(script)], cwd=tmp_path, env=_runnable_env(tmp_path), timeout_s=30
    )
    assert result.returncode == 3
    assert result.stdout.strip() == "hi"
    assert result.stderr.strip() == "err"
    assert not result.ok


async def test_run_node_kills_the_tree_on_timeout(tmp_path: Path) -> None:
    script = tmp_path / "hang.mjs"
    script.write_text(
        "import { spawn } from 'node:child_process';\n"
        "spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });\n"
        "setInterval(() => {}, 1000);\n",
        encoding="utf-8",
    )
    result = await node_runner.run_node([str(script)], cwd=tmp_path, env=_runnable_env(tmp_path), timeout_s=2)
    assert result.timed_out
    assert not result.ok


async def test_args_with_shell_metacharacters_are_passed_literally(tmp_path: Path) -> None:
    script = tmp_path / "echo.mjs"
    script.write_text("console.log(JSON.stringify(process.argv.slice(2)));\n", encoding="utf-8")
    nasty = 'x" & echo pwned & "|; $(whoami) `id`'
    result = await node_runner.run_node(
        [str(script), nasty], cwd=tmp_path, env=_runnable_env(tmp_path), timeout_s=30
    )
    assert result.ok
    assert result.stdout.strip() == f'["{nasty.replace(chr(34), chr(92) + chr(34))}"]'


def test_node_is_found_without_npm() -> None:
    node = node_runner.node_executable()
    name = Path(node).name.lower()
    assert name in ("node", "node.exe")
    assert "npm" not in name and "npx" not in name


@pytest.mark.skipif(sys.platform == "win32", reason="POSIX process groups")
def test_posix_uses_new_session() -> None:
    import inspect

    assert "start_new_session" in inspect.getsource(node_runner.run_node)
