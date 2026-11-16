"""Settings, read once at startup from the environment and this tool's own .env.

Lock 1 of the test-DB guard (ADR-007) lives here: the only database setting is
PESADO_TEST_DATABASE_URL. There is deliberately no field for DATABASE_URL,
SUPABASE_* or anything from backend/.env, and `extra="ignore"` drops every
other variable, so the app's real database can never be picked up by accident.
"""

from pathlib import Path
from typing import Self

from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# src/pesado_debug/config.py -> tools/pesado-debug-mcp
TOOL_DIR = Path(__file__).resolve().parents[2]
# tools/pesado-debug-mcp -> repo root
DEFAULT_REPO_ROOT = TOOL_DIR.parents[1]

GITHUB_VARS = ("GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO")
TEST_DB_VARS = ("PESADO_TEST_DATABASE_URL",)


class ConfigMissingError(Exception):
    """A tool was called whose required settings are not set."""

    def __init__(self, feature: str, variables: tuple[str, ...]) -> None:
        self.feature = feature
        self.variables = variables
        super().__init__(f"{feature} is disabled: set {', '.join(variables)}")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=TOOL_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        # An unset ${VAR} in .mcp.json can arrive as an empty string; treat it as unset.
        env_ignore_empty=True,
    )

    github_token: SecretStr | None = None
    github_owner: str | None = None
    github_repo: str | None = None

    pesado_test_database_url: SecretStr | None = None
    pesado_test_db_allowed_host: str | None = None

    pesado_repo_root: Path = DEFAULT_REPO_ROOT

    @model_validator(mode="after")
    def _repo_root_has_workspaces(self) -> Self:
        root = self.pesado_repo_root.resolve()
        missing = [name for name in ("backend", "frontend") if not (root / name).is_dir()]
        if missing:
            raise ValueError(f"PESADO_REPO_ROOT={root} has no {', '.join(missing)}/ folder")
        self.pesado_repo_root = root
        return self

    @property
    def github_ready(self) -> bool:
        return bool(self.github_token and self.github_owner and self.github_repo)

    @property
    def db_ready(self) -> bool:
        return self.pesado_test_database_url is not None

    def require_github(self, feature: str) -> tuple[str, str, str]:
        """Token, owner and repo, or ConfigMissingError naming what is missing."""
        if not (self.github_token and self.github_owner and self.github_repo):
            raise ConfigMissingError(feature, GITHUB_VARS)
        return self.github_token.get_secret_value(), self.github_owner, self.github_repo

    def require_test_db_url(self, feature: str) -> str:
        if self.pesado_test_database_url is None:
            raise ConfigMissingError(feature, TEST_DB_VARS)
        return self.pesado_test_database_url.get_secret_value()
