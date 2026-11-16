"""reset / seed against a real, migrated, marked Postgres (ADR-007 test plan)."""

from collections import Counter
from collections.abc import Iterator
from datetime import UTC, datetime
from typing import get_args

import psycopg
import pytest

from pesado_debug.config import Settings
from pesado_debug.core import testdb
from pesado_debug.core.scenarios import REGISTRY, ScenarioName
from pesado_debug.core.scenarios import baseline as baseline_scenario
from pesado_debug.core.testdb import TestDbRefused

pytestmark = pytest.mark.integration

WINTER_MONDAY = datetime(2026, 11, 16, 17, 0, tzinfo=UTC)  # 10:00 shop time
APP_TABLES = ("customers", "menu_items", "capacity_slots", "orders", "order_items")


@pytest.fixture
def settings(clean_env: pytest.MonkeyPatch, test_db_url: str) -> Settings:
    clean_env.setenv("PESADO_TEST_DATABASE_URL", test_db_url)
    return Settings(_env_file=None)


@pytest.fixture
def conn(test_db_url: str) -> Iterator[psycopg.Connection]:
    with psycopg.connect(test_db_url, autocommit=True) as connection:
        yield connection


def _counts(conn: psycopg.Connection) -> dict[str, int]:
    counts: dict[str, int] = {}
    for table in APP_TABLES:
        row = conn.execute(f"SELECT count(*) FROM public.{table}").fetchone()  # noqa: S608 - fixed table names
        counts[table] = int(row[0]) if row else 0
    return counts


def _expected(scenario: ScenarioName) -> dict[str, int]:
    rows = baseline_scenario.build(WINTER_MONDAY)
    if scenario != "baseline":
        rows += REGISTRY[scenario].build(WINTER_MONDAY)
    counter: Counter[str] = Counter(row.table for row in rows)
    return {table: counter.get(table, 0) for table in APP_TABLES}


def test_reset_loads_baseline_and_is_idempotent(settings: Settings, conn: psycopg.Connection) -> None:
    first = testdb.reset(settings, at=WINTER_MONDAY)
    after_first = _counts(conn)
    second = testdb.reset(settings, at=WINTER_MONDAY)
    assert _counts(conn) == after_first == _expected("baseline")
    assert first.rows_inserted == second.rows_inserted
    assert "pgmigrations" not in first.tables_truncated


@pytest.mark.parametrize("scenario", get_args(ScenarioName))
def test_each_scenario_seeds_with_intact_foreign_keys(
    settings: Settings, conn: psycopg.Connection, scenario: ScenarioName
) -> None:
    result = testdb.seed(settings, scenario=scenario, at=WINTER_MONDAY, reset_first=True)
    assert _counts(conn) == _expected(scenario)
    assert result.ids  # IDs the agent can query
    orphans = conn.execute(
        "SELECT count(*) FROM order_items oi LEFT JOIN orders o ON o.id = oi.order_id "
        "LEFT JOIN menu_items m ON m.id = oi.menu_item_id WHERE o.id IS NULL OR m.id IS NULL"
    ).fetchone()
    assert orphans is not None and orphans[0] == 0
    # The same shape getOrderForCustomer reads (orderQueries.ts).
    for order_id in result.ids.get("orders", []):
        row = conn.execute(
            "SELECT o.total_cents, c.phone, sum(oi.quantity * oi.price_at_order_cents) "
            "FROM orders o JOIN customers c ON c.id = o.customer_id "
            "JOIN order_items oi ON oi.order_id = o.id WHERE o.id = %s GROUP BY o.total_cents, c.phone",
            [order_id],
        ).fetchone()
        assert row is not None and row[0] == row[2]


def test_seeding_twice_without_reset_is_refused(settings: Settings, conn: psycopg.Connection) -> None:
    testdb.seed(settings, scenario="asap_order", at=WINTER_MONDAY, reset_first=True)
    before = _counts(conn)
    with pytest.raises(TestDbRefused, match="already seeded"):
        testdb.seed(settings, scenario="asap_order", at=WINTER_MONDAY, reset_first=False)
    assert _counts(conn) == before


def test_scenarios_stack_without_reset(settings: Settings, conn: psycopg.Connection) -> None:
    testdb.seed(settings, scenario="asap_order", at=WINTER_MONDAY, reset_first=True)
    testdb.seed(settings, scenario="mx_customer", at=WINTER_MONDAY, reset_first=False)
    assert _counts(conn)["customers"] == 2


def test_truncating_public_leaves_the_marker(settings: Settings, conn: psycopg.Connection) -> None:
    """The reason the marker lives in its own schema."""
    testdb.reset(settings, at=WINTER_MONDAY)
    row = conn.execute("SELECT name FROM pesado_meta.env WHERE name = 'test'").fetchone()
    assert row is not None


def test_unmarked_database_is_refused_with_nothing_written(
    settings: Settings, conn: psycopg.Connection
) -> None:
    testdb.reset(settings, at=WINTER_MONDAY)
    before = _counts(conn)
    conn.execute("DELETE FROM pesado_meta.env")
    try:
        with pytest.raises(TestDbRefused, match="no 'test' row"):
            testdb.seed(settings, scenario="unpaid_order", at=WINTER_MONDAY, reset_first=True)
        assert _counts(conn) == before
    finally:
        conn.execute("INSERT INTO pesado_meta.env (name) VALUES ('test') ON CONFLICT DO NOTHING")
