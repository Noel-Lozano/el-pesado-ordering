"""Backend scripts run against the test DB: migrations and seed:menu (ADR-007).

Both go through node_runner (node + entry point, cleaned env) and the locks:

- migrate-test-db: locks 1 and 2. Not lock 3, because a fresh database has no
  marker yet (order: migrate-test-db, then init-test-db). `--envPath` points
  at an empty file, so node-pg-migrate can't fall back to backend/.env (prod).
- seed:menu: called by rerun_test's integration prep after truncating, inside
  the caller's locks 1 to 3.

Entry points (checked against backend/package.json and node_modules, Node 24):
- node-pg-migrate's bin is bin/node-pg-migrate.js
- `npm run seed:menu` is `tsx scripts/seed-menu.ts`, so tsx's cli.mjs runs it
"""

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from pesado_debug.config import Settings
from pesado_debug.core import node_runner, testdb
from pesado_debug.core.testdb import Target

NODE_PG_MIGRATE: Final = Path("node_modules/node-pg-migrate/bin/node-pg-migrate.js")
TSX_CLI: Final = Path("node_modules/tsx/dist/cli.mjs")
SEED_MENU_SCRIPT: Final = Path("scripts/seed-menu.ts")
MIGRATE_TIMEOUT_S: Final = 180.0
SEED_TIMEOUT_S: Final = 120.0


class BackendScriptError(Exception):
    """A backend script failed or couldn't run."""


@dataclass(frozen=True)
class ScriptRun:
    target: Target
    output: str


def _require(path: Path) -> None:
    if not path.is_file():
        raise BackendScriptError(f"{path} is missing. Run `npm ci` in backend/ first.")


def _check(result: node_runner.NodeResult, what: str) -> str:
    if result.timed_out:
        raise BackendScriptError(f"{what} timed out.\n{result.output_tail()}")
    if not result.ok:
        raise BackendScriptError(f"{what} failed (exit {result.returncode}).\n{result.output_tail()}")
    return result.output_tail()


async def migrate_test_db(settings: Settings) -> ScriptRun:
    url = testdb.database_url(settings, "migrate-test-db")  # lock 1
    target = testdb.check_host_allowed(url, settings.pesado_test_db_allowed_host)  # lock 2
    backend = node_runner.backend_dir(settings.pesado_repo_root)
    _require(backend / NODE_PG_MIGRATE)
    with node_runner.temp_dir() as tmp:
        empty = node_runner.empty_env_file(Path(tmp))
        env = node_runner.build_child_env(
            os.environ, test_db_url=url, env_example=backend / ".env.example", empty_env_file=empty
        )
        result = await node_runner.run_node(
            [str(NODE_PG_MIGRATE), "up", "--envPath", str(empty)],
            cwd=backend,
            env=env,
            timeout_s=MIGRATE_TIMEOUT_S,
        )
    return ScriptRun(target=target, output=_check(result, "node-pg-migrate up"))


async def seed_menu(settings: Settings, url: str) -> str:
    """Run backend/scripts/seed-menu.ts against `url`. The caller has already passed all three locks."""
    backend = node_runner.backend_dir(settings.pesado_repo_root)
    _require(backend / TSX_CLI)
    with node_runner.temp_dir() as tmp:
        empty = node_runner.empty_env_file(Path(tmp))
        env = node_runner.build_child_env(
            os.environ, test_db_url=url, env_example=backend / ".env.example", empty_env_file=empty
        )
        result = await node_runner.run_node(
            [str(TSX_CLI), str(SEED_MENU_SCRIPT)], cwd=backend, env=env, timeout_s=SEED_TIMEOUT_S
        )
    return _check(result, "seed:menu")
