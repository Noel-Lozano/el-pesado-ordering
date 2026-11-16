"""Catches drift between core/schema.py and the migrations (ADR-007).

Runs against a freshly migrated database: CI's postgres service, or the local
docker-compose.test.yml container after `pesado-debug migrate-test-db`.
"""

import re
from collections.abc import Iterator

import psycopg
import pytest

from pesado_debug.core.schema import CHECK_CONSTRAINTS, MIGRATIONS_TABLE, TABLE_COLUMNS

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def conn(test_db_url: str) -> Iterator[psycopg.Connection]:
    with psycopg.connect(test_db_url, autocommit=True) as connection:
        yield connection


def test_app_tables_match(conn: psycopg.Connection) -> None:
    rows = conn.execute(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> %s", [MIGRATIONS_TABLE]
    ).fetchall()
    assert {str(row[0]) for row in rows} == set(TABLE_COLUMNS)


@pytest.mark.parametrize("table", sorted(TABLE_COLUMNS))
def test_columns_match(conn: psycopg.Connection, table: str) -> None:
    rows = conn.execute(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_schema = 'public' AND table_name = %s",
        [table],
    ).fetchall()
    assert {str(row[0]) for row in rows} == TABLE_COLUMNS[table]  # type: ignore[index]


@pytest.mark.parametrize("constraint", sorted(CHECK_CONSTRAINTS))
def test_check_constraint_values_match(conn: psycopg.Connection, constraint: str) -> None:
    table, _column, expected = CHECK_CONSTRAINTS[constraint]
    row = conn.execute(
        "SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c "
        "JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace "
        "WHERE n.nspname = 'public' AND t.relname = %s AND c.conname = %s",
        [table, constraint],
    ).fetchone()
    assert row is not None, f"{constraint} is missing on {table}"
    allowed = set(re.findall(r"'([^']*)'", str(row[0])))
    assert allowed == set(expected), str(row[0])
