"""The test-database guard (ADR-007) and every write this tool makes to a database.

Three independent locks must all pass before any write:

1. Separate variable: the URL only ever comes from PESADO_TEST_DATABASE_URL
   (config.py has no other database setting).
2. Host allowlist: every host the URL could connect to is localhost /
   127.0.0.1 / ::1, or exactly PESADO_TEST_DB_ALLOWED_HOST.
3. Marker row: pesado_meta.env contains 'test', checked inside the same
   transaction as the writes. Production never has this schema. It lives
   outside `public`, so truncating public can't remove it.

Uses synchronous psycopg, run in a worker thread by async callers: psycopg's
async mode can't run on Windows' ProactorEventLoop, and that loop is the one
Windows needs for the subprocesses rerun_test and migrate-test-db start.
Queries are parameterized; identifiers are composed with psycopg.sql.
"""

import os
from collections.abc import Iterator, Mapping, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
from typing import Final

import psycopg
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict

from pesado_debug.config import Settings
from pesado_debug.core.scenarios import REGISTRY, Row, ScenarioName
from pesado_debug.core.scenarios import baseline as baseline_scenario
from pesado_debug.core.schema import INSERT_ORDER, MIGRATIONS_TABLE, TABLE_COLUMNS
from pesado_debug.models import ResetResult, SeedResult

LOCAL_HOSTS: Final = frozenset({"localhost", "127.0.0.1", "::1"})
MARKER_SCHEMA: Final = "pesado_meta"
MARKER_TABLE: Final = "env"
MARKER_VALUE: Final = "test"
CONNECT_TIMEOUT_S: Final = 10
# libpq reads these from the environment for parameters the URL leaves out, so
# they could redirect a connection whose URL looks local.
REDIRECTING_ENV_VARS: Final = ("PGHOSTADDR", "PGSERVICE")


class TestDbRefused(Exception):
    """A lock refused the operation. Nothing was written."""

    __test__ = False  # not a pytest test class


class TestDbError(Exception):
    """The database itself returned an error."""

    __test__ = False


@dataclass(frozen=True)
class Target:
    """Where a URL points, without credentials (safe to show)."""

    hosts: tuple[str, ...]
    port: str
    dbname: str

    def __str__(self) -> str:
        return f"{','.join(self.hosts)}:{self.port}/{self.dbname}"


# --- Lock 1 --------------------------------------------------------------------


def database_url(settings: Settings, feature: str) -> str:
    """Lock 1: the only database URL this tool will ever use."""
    return settings.require_test_db_url(feature)


# --- Lock 2 --------------------------------------------------------------------


def check_host_allowed(url: str, allowed_host: str | None, env: Mapping[str, str] | None = None) -> Target:
    """Lock 2. Refuses anything that could connect somewhere other than an allowed host."""
    environ = os.environ if env is None else env
    for name in REDIRECTING_ENV_VARS:
        if environ.get(name):
            raise TestDbRefused(
                f"{name} is set in the environment; it could redirect the connection. Unset it."
            )
    try:
        params = conninfo_to_dict(url)
    except psycopg.ProgrammingError as exc:
        raise TestDbRefused(f"PESADO_TEST_DATABASE_URL is not a valid connection string: {exc}") from None
    if params.get("service"):
        raise TestDbRefused("PESADO_TEST_DATABASE_URL uses service=, which reads hosts from a service file.")

    allowed = {host.casefold() for host in LOCAL_HOSTS}
    if allowed_host:
        allowed.add(allowed_host.strip().casefold())

    raw_hosts = str(params.get("host") or "")
    if not raw_hosts:
        raise TestDbRefused("PESADO_TEST_DATABASE_URL has no host (libpq would fall back to PGHOST).")
    hosts = tuple(h.strip() for h in raw_hosts.split(","))
    for host in hosts:
        if not host or host.startswith(("/", "@")) or "\\" in host:
            raise TestDbRefused(f"Unix-socket or empty host {host!r} is not allowed; use a TCP host.")
        if host.casefold() not in allowed:
            raise TestDbRefused(
                f"Host {host!r} is not allowed. Allowed: localhost, 127.0.0.1, ::1"
                + (f", {allowed_host}" if allowed_host else "")
                + ". Set PESADO_TEST_DB_ALLOWED_HOST only for a dedicated test database."
            )
    raw_addrs = str(params.get("hostaddr") or "")
    for addr in (a.strip() for a in raw_addrs.split(",") if a.strip()):
        if addr.casefold() not in allowed:
            raise TestDbRefused(f"hostaddr {addr!r} is not allowed.")
    return Target(hosts=hosts, port=str(params.get("port") or "5432"), dbname=str(params.get("dbname") or ""))


# --- Lock 3 --------------------------------------------------------------------


def assert_marker(conn: psycopg.Connection) -> None:
    """Lock 3. Must run inside the transaction that writes."""
    exists = conn.execute(
        "SELECT to_regclass(%s) IS NOT NULL", [f"{MARKER_SCHEMA}.{MARKER_TABLE}"]
    ).fetchone()
    if not exists or not exists[0]:
        raise TestDbRefused(
            f"This database has no {MARKER_SCHEMA}.{MARKER_TABLE} table, so it is not marked as a test "
            "database. If it really is one, run: uv run pesado-debug init-test-db"
        )
    marked = conn.execute(
        sql.SQL("SELECT 1 FROM {} WHERE name = %s").format(sql.Identifier(MARKER_SCHEMA, MARKER_TABLE)),
        [MARKER_VALUE],
    ).fetchone()
    if not marked:
        raise TestDbRefused(f"{MARKER_SCHEMA}.{MARKER_TABLE} has no '{MARKER_VALUE}' row; refusing to write.")


# --- Connections ---------------------------------------------------------------


def _connect(url: str) -> psycopg.Connection:
    try:
        return psycopg.connect(url, connect_timeout=CONNECT_TIMEOUT_S)
    except psycopg.OperationalError as exc:
        raise TestDbError(f"Could not connect to the test database: {exc}".strip()) from exc


@contextmanager
def guarded_transaction(settings: Settings, feature: str) -> Iterator[tuple[psycopg.Connection, Target]]:
    """All three locks, then a transaction that commits only if the body succeeds."""
    url = database_url(settings, feature)
    target = check_host_allowed(url, settings.pesado_test_db_allowed_host)
    try:
        with _connect(url) as conn, conn.transaction():
            assert_marker(conn)
            yield conn, target
    except psycopg.Error as exc:
        raise TestDbError(f"Database error: {exc}".strip()) from exc


# --- Writes --------------------------------------------------------------------


def truncate_public(conn: psycopg.Connection) -> list[str]:
    """TRUNCATE every table in public except the migrations table. The caller holds lock 3."""
    rows = conn.execute(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> %s ORDER BY tablename",
        [MIGRATIONS_TABLE],
    ).fetchall()
    tables = [str(row[0]) for row in rows]
    if tables:
        conn.execute(
            sql.SQL("TRUNCATE {} RESTART IDENTITY CASCADE").format(
                sql.SQL(", ").join(sql.Identifier("public", table) for table in tables)
            )
        )
    return tables


def insert_rows(conn: psycopg.Connection, rows: Sequence[Row]) -> dict[str, list[int]]:
    """Insert rows through the column allowlist, in foreign-key order."""
    ids: dict[str, list[int]] = {}
    ordered = sorted(rows, key=lambda row: INSERT_ORDER.index(row.table))
    for row in ordered:
        allowed = TABLE_COLUMNS[row.table]
        unknown = set(row.values) - allowed
        if unknown:
            raise TestDbError(f"{row.table} has no column(s) {sorted(unknown)} (schema drift?)")
        columns = list(row.values)
        statement = sql.SQL("INSERT INTO {} ({}) VALUES ({})").format(
            sql.Identifier("public", row.table),
            sql.SQL(", ").join(sql.Identifier(column) for column in columns),
            sql.SQL(", ").join(sql.Placeholder() * len(columns)),
        )
        conn.execute(statement, [row.values[column] for column in columns])
        ids.setdefault(row.table, []).append(row.id)
    return ids


def _existing_ids(conn: psycopg.Connection, rows: Sequence[Row]) -> list[str]:
    found: list[str] = []
    for table in INSERT_ORDER:
        wanted = [row.id for row in rows if row.table == table]
        if not wanted:
            continue
        hits = conn.execute(
            sql.SQL("SELECT id FROM {} WHERE id = ANY(%s) ORDER BY id").format(
                sql.Identifier("public", table)
            ),
            [wanted],
        ).fetchall()
        found += [f"{table}.{row[0]}" for row in hits]
    return found


def _baseline_present(conn: psycopg.Connection) -> bool:
    row = conn.execute(
        "SELECT 1 FROM public.menu_items WHERE id = %s", [baseline_scenario.ASADO_BURRITO]
    ).fetchone()
    return row is not None


def reset(settings: Settings, *, at: datetime) -> ResetResult:
    with guarded_transaction(settings, "reset_test_db") as (conn, target):
        tables = truncate_public(conn)
        inserted = insert_rows(conn, baseline_scenario.build(at))
    return ResetResult(
        database=str(target),
        tables_truncated=tables,
        rows_inserted={table: len(ids) for table, ids in inserted.items()},
    )


def seed(settings: Settings, *, scenario: ScenarioName, at: datetime, reset_first: bool) -> SeedResult:
    chosen = REGISTRY[scenario]
    chosen.check_at(at)
    rows = chosen.build(at)
    ids: dict[str, list[int]] = {}
    with guarded_transaction(settings, "seed_test_data") as (conn, target):
        if reset_first:
            truncate_public(conn)
        if scenario != "baseline" and not _baseline_present(conn):
            for table, new in insert_rows(conn, baseline_scenario.build(at)).items():
                ids.setdefault(table, []).extend(new)
        existing = _existing_ids(conn, rows)
        if existing:
            raise TestDbRefused(
                f"{scenario} is already seeded ({', '.join(existing[:5])}); use reset=true to start over."
            )
        for table, new in insert_rows(conn, rows).items():
            ids.setdefault(table, []).extend(new)
    return SeedResult(
        scenario=scenario,
        at=at,
        database=str(target),
        reset=reset_first,
        ids=ids,
        notes=list(chosen.notes),
    )


# --- Marking a database as test (CLI only, never an MCP tool) -----------------


def target_for_init(settings: Settings) -> tuple[str, Target]:
    """Locks 1 and 2 for init-test-db: it can never mark a non-allowlisted database."""
    url = database_url(settings, "init-test-db")
    return url, check_host_allowed(url, settings.pesado_test_db_allowed_host)


def init_marker(url: str) -> None:
    """Create pesado_meta.env and its 'test' row. Idempotent. The caller ran target_for_init."""
    try:
        with _connect(url) as conn, conn.transaction():
            conn.execute(sql.SQL("CREATE SCHEMA IF NOT EXISTS {}").format(sql.Identifier(MARKER_SCHEMA)))
            conn.execute(
                sql.SQL(
                    "CREATE TABLE IF NOT EXISTS {} ("
                    "name text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now())"
                ).format(sql.Identifier(MARKER_SCHEMA, MARKER_TABLE))
            )
            conn.execute(
                sql.SQL("INSERT INTO {} (name) VALUES (%s) ON CONFLICT (name) DO NOTHING").format(
                    sql.Identifier(MARKER_SCHEMA, MARKER_TABLE)
                ),
                [MARKER_VALUE],
            )
    except psycopg.Error as exc:
        raise TestDbError(f"Database error: {exc}".strip()) from exc


def truncate_for_rerun(settings: Settings) -> str:
    """rerun_test's integration prep, part 1: all three locks, then truncate public (no baseline).

    Returns the URL for seed:menu and the test run, which go to the same database.
    """
    with guarded_transaction(settings, "rerun_test") as (conn, _target):
        truncate_public(conn)
    return database_url(settings, "rerun_test")
