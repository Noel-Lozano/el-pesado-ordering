"""Test fixture files, and a helper to find them."""

from pathlib import Path

FIXTURES = Path(__file__).parent


def fixture_path(*parts: str) -> Path:
    return FIXTURES.joinpath(*parts)


def fixture_text(*parts: str) -> str:
    return fixture_path(*parts).read_text(encoding="utf-8")
