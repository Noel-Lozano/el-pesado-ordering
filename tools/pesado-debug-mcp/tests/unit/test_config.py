from pathlib import Path

import pytest
from pydantic import ValidationError

from pesado_debug.config import DEFAULT_REPO_ROOT, ConfigMissingError, Settings

PROD_SENTINEL = "postgres://prod-user:prod-secret@db.prod.example:5432/postgres"


def _all_values(settings: Settings) -> str:
    parts: list[str] = []
    for name in Settings.model_fields:
        value = getattr(settings, name)
        if hasattr(value, "get_secret_value"):
            value = value.get_secret_value()
        parts.append(str(value))
    return " ".join(parts)


def test_database_url_from_environment_is_never_read(clean_env: pytest.MonkeyPatch) -> None:
    clean_env.setenv("DATABASE_URL", PROD_SENTINEL)
    settings = Settings(_env_file=None)
    assert settings.pesado_test_database_url is None
    assert not settings.db_ready
    assert PROD_SENTINEL not in _all_values(settings)


def test_database_url_from_env_file_is_never_read(clean_env: pytest.MonkeyPatch, tmp_path: Path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(
        f"DATABASE_URL={PROD_SENTINEL}\nSUPABASE_URL=https://x.supabase.co\n", encoding="utf-8"
    )
    settings = Settings(_env_file=env_file)
    assert settings.pesado_test_database_url is None
    assert PROD_SENTINEL not in _all_values(settings)


def test_test_database_url_is_read(clean_env: pytest.MonkeyPatch) -> None:
    clean_env.setenv("PESADO_TEST_DATABASE_URL", "postgresql://u:p@127.0.0.1:54329/pesado_test")
    settings = Settings(_env_file=None)
    assert settings.db_ready
    assert settings.require_test_db_url("seed_test_data").endswith("/pesado_test")


def test_missing_github_vars_disable_only_github(clean_env: pytest.MonkeyPatch) -> None:
    clean_env.setenv("GITHUB_TOKEN", "ghp_x")
    clean_env.setenv("PESADO_TEST_DATABASE_URL", "postgresql://u:p@localhost/pesado_test")
    settings = Settings(_env_file=None)
    assert not settings.github_ready
    with pytest.raises(ConfigMissingError) as excinfo:
        settings.require_github("get_failed_runs")
    message = str(excinfo.value)
    assert message.startswith("get_failed_runs is disabled")
    assert "GITHUB_OWNER" in message and "GITHUB_REPO" in message
    assert settings.require_test_db_url("seed_test_data")


def test_missing_test_db_url_names_the_variable(bare_settings: Settings) -> None:
    with pytest.raises(ConfigMissingError, match="PESADO_TEST_DATABASE_URL"):
        bare_settings.require_test_db_url("reset_test_db")


def test_empty_values_count_as_unset(clean_env: pytest.MonkeyPatch) -> None:
    for name in ("GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO", "PESADO_TEST_DATABASE_URL"):
        clean_env.setenv(name, "")
    settings = Settings(_env_file=None)
    assert not settings.github_ready
    assert not settings.db_ready


def test_secrets_are_not_in_repr(clean_env: pytest.MonkeyPatch) -> None:
    clean_env.setenv("GITHUB_TOKEN", "ghp_supersecret")
    clean_env.setenv("PESADO_TEST_DATABASE_URL", "postgresql://u:dbsecret@localhost/pesado_test")
    settings = Settings(_env_file=None)
    assert "ghp_supersecret" not in repr(settings)
    assert "dbsecret" not in repr(settings)


def test_repo_root_defaults_to_this_repo(bare_settings: Settings) -> None:
    assert bare_settings.pesado_repo_root == DEFAULT_REPO_ROOT.resolve()
    assert (bare_settings.pesado_repo_root / "backend").is_dir()


def test_repo_root_without_workspaces_is_rejected(clean_env: pytest.MonkeyPatch, tmp_path: Path) -> None:
    clean_env.setenv("PESADO_REPO_ROOT", str(tmp_path))
    with pytest.raises(ValidationError, match="backend, frontend"):
        Settings(_env_file=None)
