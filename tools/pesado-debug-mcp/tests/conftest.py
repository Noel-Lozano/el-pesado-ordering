"""Shared test setup.

Integration tests (marked `integration`) need a migrated, marked Postgres test
DB in PESADO_TEST_DATABASE_URL. Locally they are skipped when it is unset. In
CI, PESADO_REQUIRE_INTEGRATION=1 turns that skip into a failure, so a
misconfigured job can't go green by silently skipping them.
"""

import os
from collections.abc import Iterator

import pytest

from pesado_debug.config import Settings

ENV_VARS_UNDER_TEST = (
    "GITHUB_TOKEN",
    "GITHUB_OWNER",
    "GITHUB_REPO",
    "PESADO_TEST_DATABASE_URL",
    "PESADO_TEST_DB_ALLOWED_HOST",
    "PESADO_REPO_ROOT",
    "DATABASE_URL",
)


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    if os.environ.get("PESADO_TEST_DATABASE_URL"):
        return
    if os.environ.get("PESADO_REQUIRE_INTEGRATION") == "1":
        if any("integration" in item.keywords for item in items):
            raise pytest.UsageError(
                "PESADO_REQUIRE_INTEGRATION=1 but PESADO_TEST_DATABASE_URL is unset: "
                "integration tests would be skipped"
            )
        return
    skip = pytest.mark.skip(reason="PESADO_TEST_DATABASE_URL is not set")
    for item in items:
        if "integration" in item.keywords:
            item.add_marker(skip)


@pytest.fixture
def clean_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[pytest.MonkeyPatch]:
    """Remove every variable the settings could read, so tests start from nothing."""
    for name in ENV_VARS_UNDER_TEST:
        monkeypatch.delenv(name, raising=False)
    yield monkeypatch


@pytest.fixture
def bare_settings(clean_env: pytest.MonkeyPatch) -> Settings:
    """Settings with nothing configured and no .env file read."""
    return Settings(_env_file=None)
