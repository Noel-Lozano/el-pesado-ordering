import pytest

from pesado_debug.core.rerun import verdict


@pytest.mark.parametrize(
    ("passes", "fails", "expected"),
    [
        (5, 0, "passes_locally"),
        (1, 0, "passes_locally"),
        (0, 5, "deterministic_fail"),
        (0, 1, "deterministic_fail"),
        (4, 1, "flaky"),
        (1, 4, "flaky"),
    ],
)
def test_verdict(passes: int, fails: int, expected: str) -> None:
    assert verdict(passes, fails) == expected
