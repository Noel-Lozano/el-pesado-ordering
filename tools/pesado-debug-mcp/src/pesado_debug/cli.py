"""`pesado-debug` CLI: the same core as the MCP server, for humans and CI.

  pesado-debug migrate-test-db              run backend migrations on the test DB (locks 1, 2)
  pesado-debug init-test-db [--confirm DB]  mark the test DB as test (locks 1, 2; CLI only)
  pesado-debug reset                        truncate + baseline (locks 1-3)
  pesado-debug seed SCENARIO [--at ISO] [--no-reset]
  pesado-debug report --from-dir DIR --out FILE [--title T] [--run-url URL]

This is the only module allowed to print: it talks to a person on stdout
(ruff T20 is ignored for this file only). The MCP server never imports it.
"""

import argparse
import asyncio
import json
import sys
from collections.abc import Sequence
from datetime import datetime
from pathlib import Path
from typing import cast, get_args

from pesado_debug.config import ConfigMissingError, Settings
from pesado_debug.core import migrate, report, testdb
from pesado_debug.core.node_runner import NodeRunnerError
from pesado_debug.core.scenarios import REGISTRY, ScenarioError, ScenarioName
from pesado_debug.core.shop_time import NaiveDatetimeError
from pesado_debug.core.testdb import TestDbError, TestDbRefused

EXIT_REFUSED = 2
EXIT_FAILED = 1

KNOWN_ERRORS: tuple[type[Exception], ...] = (
    ConfigMissingError,
    TestDbRefused,
    TestDbError,
    ScenarioError,
    NaiveDatetimeError,
    NodeRunnerError,
    migrate.BackendScriptError,
)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="pesado-debug", description=__doc__.split("\n\n")[0])
    commands = parser.add_subparsers(dest="command", required=True)

    commands.add_parser("migrate-test-db", help="Run backend migrations against PESADO_TEST_DATABASE_URL.")

    init = commands.add_parser("init-test-db", help="Mark PESADO_TEST_DATABASE_URL's database as a test DB.")
    init.add_argument("--confirm", metavar="DBNAME", help="Non-interactive: must equal the database name.")

    commands.add_parser("reset", help="Truncate every app table and load the baseline scenario.")

    seed = commands.add_parser("seed", help="Load a named scenario.")
    seed.add_argument("scenario", choices=list(get_args(ScenarioName)))
    seed.add_argument("--at", help="ISO datetime with offset (default: the scenario's own default).")
    seed.add_argument(
        "--no-reset", action="store_true", help="Keep existing rows instead of truncating first."
    )

    rep = commands.add_parser("report", help="Append a markdown test report built from JUnit XML files.")
    rep.add_argument("--from-dir", required=True, type=Path, help="Folder searched recursively for *.xml.")
    rep.add_argument("--out", required=True, type=Path, help="File to append to, e.g. $GITHUB_STEP_SUMMARY.")
    rep.add_argument("--title", help="Optional heading prefix.")
    rep.add_argument("--run-url", help="Link shown when no test results exist.")
    return parser


def _parse_at(value: str | None, scenario: ScenarioName) -> datetime:
    if value is None:
        return REGISTRY[scenario].default_at(datetime.now().astimezone())
    at = datetime.fromisoformat(value)
    if at.tzinfo is None:
        raise NaiveDatetimeError(f"--at {value!r} needs a UTC offset, e.g. 2026-11-16T10:00:00-07:00")
    return at


def _print_json(model: object) -> None:
    dump = getattr(model, "model_dump", None)
    data = dump(mode="json") if callable(dump) else model
    print(json.dumps(data, indent=2, ensure_ascii=False))


def _init_test_db(settings: Settings, confirm: str | None) -> int:
    url, target = testdb.target_for_init(settings)
    print(
        f"About to mark {target} as a TEST database (creates {testdb.MARKER_SCHEMA}.{testdb.MARKER_TABLE})."
    )
    print("Seed and reset will then be allowed to delete every row in its public schema.")
    if not target.dbname:
        print("The URL names no database; refusing.")
        return EXIT_REFUSED
    typed = (
        confirm if confirm is not None else input(f"Type the database name ({target.dbname}) to confirm: ")
    )
    if typed.strip() != target.dbname:
        print("Name didn't match; nothing was changed.")
        return EXIT_REFUSED
    testdb.init_marker(url)
    print(f"Marked {target} as a test database.")
    return 0


def run(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.command == "report":
        # Needs no settings, token or database. Always exits 0: the report describes
        # failures; the test jobs are what fail the build.
        report.append_report(
            report.build_report(args.from_dir, title=args.title, run_url=args.run_url), args.out
        )
        return 0
    try:
        settings = Settings()
        match args.command:
            case "migrate-test-db":
                result = asyncio.run(migrate.migrate_test_db(settings))
                print(result.output)
                print(f"Migrated {result.target}.")
            case "init-test-db":
                return _init_test_db(settings, args.confirm)
            case "reset":
                _print_json(testdb.reset(settings, at=datetime.now().astimezone()))
            case "seed":
                scenario = cast(ScenarioName, args.scenario)
                at = _parse_at(args.at, scenario)
                _print_json(testdb.seed(settings, scenario=scenario, at=at, reset_first=not args.no_reset))
    except (ConfigMissingError, TestDbRefused) as exc:
        print(f"Refused: {exc}", file=sys.stderr)
        return EXIT_REFUSED
    except KNOWN_ERRORS as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return EXIT_FAILED
    return 0


def main() -> None:
    sys.exit(run())


if __name__ == "__main__":
    main()
