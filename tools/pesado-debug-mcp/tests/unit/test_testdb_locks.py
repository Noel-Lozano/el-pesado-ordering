"""Each of the three test-DB locks must block on its own (ADR-007)."""

from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Any

import pytest

from pesado_debug.config import ConfigMissingError, Settings
from pesado_debug.core import testdb
from pesado_debug.core.testdb import TestDbRefused

LOCAL_URL = "postgresql://postgres:postgres@127.0.0.1:54329/pesado_test"

# --- Lock 1: only PESADO_TEST_DATABASE_URL ------------------------------------


def test_lock1_database_url_alone_is_refused(clean_env: pytest.MonkeyPatch) -> None:
    clean_env.setenv("DATABASE_URL", LOCAL_URL)
    settings = Settings(_env_file=None)
    with pytest.raises(ConfigMissingError, match="PESADO_TEST_DATABASE_URL"):
        testdb.database_url(settings, "reset_test_db")


def test_lock1_blocks_reset_before_any_connection(
    clean_env: pytest.MonkeyPatch, monkeypatch: pytest.MonkeyPatch
) -> None:
    clean_env.setenv("DATABASE_URL", LOCAL_URL)

    def no_connect(url: str) -> None:
        raise AssertionError("must not connect")

    monkeypatch.setattr(testdb, "_connect", no_connect)
    with pytest.raises(ConfigMissingError):
        testdb.reset(Settings(_env_file=None), at=datetime(2026, 11, 16, 17, tzinfo=UTC))


# --- Lock 2: host allowlist ------------------------------------------------------


@pytest.mark.parametrize(
    "url",
    [
        "postgresql://u:p@localhost/pesado_test",
        "postgresql://u:p@127.0.0.1:54329/pesado_test",
        "postgresql://u:p@[::1]:5432/pesado_test",
        "host=LOCALHOST port=5432 dbname=pesado_test user=u",
    ],
)
def test_lock2_local_hosts_are_allowed(url: str) -> None:
    target = testdb.check_host_allowed(url, None, env={})
    assert target.dbname == "pesado_test"


@pytest.mark.parametrize(
    ("url", "reason"),
    [
        ("postgresql://u:p@db.prod.example:5432/postgres", "not allowed"),
        ("postgresql://u:p@aws-0-us-west-1.pooler.supabase.com:5432/postgres", "not allowed"),
        ("host=localhost,prod.example dbname=x user=u", "'prod.example' is not allowed"),
        ("host=localhost hostaddr=10.0.0.5 dbname=x user=u", "hostaddr '10.0.0.5'"),
        ("host=/var/run/postgresql dbname=x user=u", "Unix-socket"),
        ("postgresql:///pesado_test", "no host"),
        ("dbname=pesado_test user=u", "no host"),
        ("service=prod", "service="),
        ("this is not a conninfo", "not a valid connection string"),
    ],
)
def test_lock2_refuses(url: str, reason: str) -> None:
    with pytest.raises(TestDbRefused, match=reason):
        testdb.check_host_allowed(url, None, env={})


def test_lock2_extra_host_must_match_exactly() -> None:
    pooler = "aws-0-us-west-1.pooler.supabase.com"
    url = f"postgresql://u:p@{pooler}:5432/postgres"
    assert testdb.check_host_allowed(url, pooler, env={}).hosts == (pooler,)
    with pytest.raises(TestDbRefused):
        testdb.check_host_allowed(url, "pooler.supabase.com", env={})


@pytest.mark.parametrize("variable", ["PGHOSTADDR", "PGSERVICE"])
def test_lock2_refuses_redirecting_libpq_env(variable: str) -> None:
    with pytest.raises(TestDbRefused, match=variable):
        testdb.check_host_allowed(LOCAL_URL, None, env={variable: "x"})


def test_lock2_blocks_reset_before_any_connection(
    clean_env: pytest.MonkeyPatch, monkeypatch: pytest.MonkeyPatch
) -> None:
    clean_env.setenv("PESADO_TEST_DATABASE_URL", "postgresql://u:p@db.prod.example/postgres")

    def no_connect(url: str) -> None:
        raise AssertionError("must not connect")

    monkeypatch.setattr(testdb, "_connect", no_connect)
    with pytest.raises(TestDbRefused, match="not allowed"):
        testdb.reset(Settings(_env_file=None), at=datetime(2026, 11, 16, 17, tzinfo=UTC))


def test_target_never_contains_credentials() -> None:
    target = testdb.check_host_allowed("postgresql://user:hunter2@localhost:54329/pesado_test", None, env={})
    assert str(target) == "localhost:54329/pesado_test"


# --- Lock 3: marker row ------------------------------------------------------------


class _Result:
    def __init__(self, row: tuple[Any, ...] | None) -> None:
        self.row = row

    def fetchone(self) -> tuple[Any, ...] | None:
        return self.row


class FakeConnection:
    """Answers the two marker queries; records everything else it is asked."""

    def __init__(self, *, table_exists: bool, marked: bool) -> None:
        self.table_exists = table_exists
        self.marked = marked
        self.statements: list[str] = []

    def execute(self, query: object, params: object = None) -> _Result:
        text = str(query)
        self.statements.append(text)
        if "to_regclass" in text:
            return _Result((self.table_exists,))
        if "WHERE name" in text:
            return _Result((1,) if self.marked else None)
        raise AssertionError(f"unexpected statement before the marker check: {text}")


def test_lock3_missing_marker_table_is_refused() -> None:
    conn = FakeConnection(table_exists=False, marked=False)
    with pytest.raises(TestDbRefused, match="init-test-db"):
        testdb.assert_marker(conn)  # type: ignore[arg-type]
    assert len(conn.statements) == 1


def test_lock3_table_without_test_row_is_refused() -> None:
    with pytest.raises(TestDbRefused, match="no 'test' row"):
        testdb.assert_marker(FakeConnection(table_exists=True, marked=False))  # type: ignore[arg-type]


def test_lock3_marked_database_passes() -> None:
    testdb.assert_marker(FakeConnection(table_exists=True, marked=True))  # type: ignore[arg-type]


def test_lock3_blocks_writes_in_the_same_transaction(
    clean_env: pytest.MonkeyPatch, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The marker check runs inside the transaction, before any TRUNCATE or INSERT."""
    clean_env.setenv("PESADO_TEST_DATABASE_URL", LOCAL_URL)
    events: list[str] = []

    class _Tx:
        def __enter__(self) -> None:
            events.append("begin")

        def __exit__(self, *exc: object) -> None:
            events.append("rollback" if exc[0] else "commit")

    class _Conn(FakeConnection):
        def transaction(self) -> _Tx:
            return _Tx()

        def __enter__(self) -> "_Conn":
            return self

        def __exit__(self, *exc: object) -> None:
            return None

    fake = _Conn(table_exists=False, marked=False)

    def connect(url: str) -> _Conn:
        return fake

    monkeypatch.setattr(testdb, "_connect", connect)
    with pytest.raises(TestDbRefused):
        testdb.reset(Settings(_env_file=None), at=datetime(2026, 11, 16, 17, tzinfo=UTC))
    assert events == ["begin", "rollback"]
    assert not any("TRUNCATE" in s or "INSERT" in s for s in fake.statements)


@pytest.fixture(autouse=True)
def _no_libpq_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    for name in testdb.REDIRECTING_ENV_VARS:
        monkeypatch.delenv(name, raising=False)
    yield
