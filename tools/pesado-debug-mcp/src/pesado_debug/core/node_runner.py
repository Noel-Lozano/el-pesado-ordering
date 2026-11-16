"""The one place this tool starts Node (ADR-007).

- Entry points are run directly with `node` (found by shutil.which), never
  through npm or npx. On Windows those are .cmd shims that run through cmd.exe,
  where argument quoting can't be made safe.
- Arguments are always a list; there is never a shell.
- The child environment is cleaned: no GITHUB_TOKEN, no PESADO_* settings,
  and DATABASE_URL is the *test* URL. Every key in backend/.env.example gets a
  placeholder, and DOTENV_CONFIG_PATH points at an empty file, so dotenv can't
  load backend/.env (the real database and credentials). dotenv never
  overrides a key that is already set, so the placeholders always win.
- A timeout kills the whole process tree (Vitest forks child processes).
"""

import asyncio
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Final

MAX_OUTPUT_CHARS: Final = 20_000

# The same throwaway values CI uses (.github/workflows/ci.yml), valid for
# backend/src/config/env.ts. A key added to backend/.env.example must get a
# placeholder here, or build_child_env refuses to run (and a unit test fails).
PLACEHOLDERS: Final[dict[str, str]] = {
    "NODE_ENV": "test",
    "PORT": "4000",
    "JWT_SECRET": "ci-only-jwt-secret",
    "TWILIO_ACCOUNT_SID": "ACci_placeholder",
    "TWILIO_AUTH_TOKEN": "ci_placeholder",
    "TWILIO_VERIFY_SERVICE_SID": "VA" + "0" * 32,
    "CORS_ORIGINS": "http://localhost:3000",
}
# Never passed to a child, whatever the parent environment holds.
STRIPPED_PREFIXES: Final = ("PESADO_", "GITHUB_TOKEN", "SUPABASE_", "STRIPE_")

_ACTIVE_KEY = re.compile(r"^\s*([A-Z][A-Z0-9_]*)\s*=")
_COMMENTED_KEY = re.compile(r"^\s*#\s*([A-Z][A-Z0-9_]*)\s*=")


class NodeRunnerError(Exception):
    """Node couldn't be started, or the environment couldn't be made safe."""


@dataclass(frozen=True)
class NodeResult:
    returncode: int | None
    stdout: str
    stderr: str
    timed_out: bool

    @property
    def ok(self) -> bool:
        return self.returncode == 0 and not self.timed_out

    def output_tail(self, max_chars: int = 4_000) -> str:
        text = (self.stdout + "\n" + self.stderr).strip()
        return text[-max_chars:]


def env_example_keys(env_example: Path) -> tuple[list[str], list[str]]:
    """(active keys, commented-out keys) in a .env.example file."""
    active: list[str] = []
    commented: list[str] = []
    for line in env_example.read_text(encoding="utf-8").splitlines():
        if match := _ACTIVE_KEY.match(line):
            active.append(match.group(1))
        elif match := _COMMENTED_KEY.match(line):
            commented.append(match.group(1))
    return active, commented


def build_child_env(
    base: Mapping[str, str], *, test_db_url: str | None, env_example: Path, empty_env_file: Path
) -> dict[str, str]:
    active, commented = env_example_keys(env_example)
    missing = [key for key in active if key != "DATABASE_URL" and key not in PLACEHOLDERS]
    if missing:
        raise NodeRunnerError(
            f"backend/.env.example has {', '.join(missing)} with no placeholder in node_runner.PLACEHOLDERS; "
            "add one before running Node, so the real value can't leak in from backend/.env."
        )
    env = {
        key: value
        for key, value in base.items()
        if not key.startswith(STRIPPED_PREFIXES) and key not in active and key not in commented
    }
    env.update({key: PLACEHOLDERS[key] for key in active if key != "DATABASE_URL"})
    if test_db_url is not None:
        env["DATABASE_URL"] = test_db_url
    env["DOTENV_CONFIG_PATH"] = str(empty_env_file)
    return env


def empty_env_file(directory: Path) -> Path:
    path = directory / "empty.env"
    path.write_text("", encoding="utf-8")
    return path


def node_executable() -> str:
    node = shutil.which("node")
    if node is None:
        raise NodeRunnerError("`node` is not on PATH. Install Node 24 (see the root package.json engines).")
    return node


async def run_node(args: list[str], *, cwd: Path, env: Mapping[str, str], timeout_s: float) -> NodeResult:
    """Run `node <args...>` in `cwd`. Output is captured, never written to this process's stdout."""
    popen_kwargs: dict[str, object] = {}
    if sys.platform == "win32":
        popen_kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        popen_kwargs["start_new_session"] = True
    try:
        process = await asyncio.create_subprocess_exec(
            node_executable(),
            *args,
            cwd=cwd,
            env=dict(env),
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            **popen_kwargs,  # type: ignore[arg-type]  # platform-specific keyword arguments
        )
    except OSError as exc:
        raise NodeRunnerError(f"Could not start node: {exc}") from exc
    try:
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=timeout_s)
    except TimeoutError:
        await _kill_tree(process)
        stdout, stderr = await process.communicate()
        return NodeResult(None, _tail(stdout), _tail(stderr), timed_out=True)
    return NodeResult(process.returncode, _tail(stdout), _tail(stderr), timed_out=False)


async def _kill_tree(process: asyncio.subprocess.Process) -> None:
    if sys.platform == "win32":
        killer = await asyncio.create_subprocess_exec(
            "taskkill",
            "/T",
            "/F",
            "/PID",
            str(process.pid),
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await killer.wait()
    else:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    try:
        process.kill()
    except ProcessLookupError:
        pass


def _tail(data: bytes) -> str:
    return data.decode("utf-8", errors="replace")[-MAX_OUTPUT_CHARS:]


def backend_dir(repo_root: Path) -> Path:
    return repo_root / "backend"


def temp_dir() -> tempfile.TemporaryDirectory[str]:
    return tempfile.TemporaryDirectory(prefix="pesado-debug-")
