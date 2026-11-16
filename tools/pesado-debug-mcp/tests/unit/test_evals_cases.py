"""Every eval case file is well-formed and names its own branch."""

from pathlib import Path
from typing import Any

import pytest
import yaml

from pesado_debug.config import TOOL_DIR

CASES_DIR = TOOL_DIR / "evals" / "cases"
VERDICTS = {"deterministic_fail", "flaky", "passes_locally", "no_junit"}
CASES = sorted(CASES_DIR.glob("*.yaml"))


def _load(path: Path) -> dict[str, Any]:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    assert isinstance(data, dict), path
    return data


def test_there_are_six_cases() -> None:
    assert [path.stem for path in CASES] == [
        "flaky-timing",
        "frontend-unit",
        "integration-db",
        "logic-bug",
        "typecheck",
        "unit-assertion",
    ]


@pytest.mark.parametrize("path", CASES, ids=lambda p: p.stem)
def test_case_is_well_formed(path: Path) -> None:
    case = _load(path)
    assert case["branch"] == f"eval/{path.stem}"
    assert isinstance(case["fault"], str) and case["fault"].strip()
    expected = case["expected"]
    assert set(expected) == {"category", "suspect_file", "verdict"}
    assert expected["verdict"] in VERDICTS
    assert (TOOL_DIR.parents[1] / expected["suspect_file"]).suffix in (".ts", ".tsx")
    assert case["run_id"] is None or isinstance(case["run_id"], int)
