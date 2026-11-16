"""Named, fixed test-data scenarios (ADR-007). Each module exposes SCENARIO.

blocked_customer and capacity_full are deliberately absent (ADR-007 gaps 2, 3):
the no-show threshold and the capacity-occupancy rule don't exist yet.
"""

from typing import Final

from pesado_debug.core.scenarios import (
    after_2pm_before_14,
    asap_order,
    baseline,
    mx_customer,
    scheduled_pickup,
    unpaid_order,
)
from pesado_debug.core.scenarios.base import Row, Scenario, ScenarioError, ScenarioName

REGISTRY: Final[dict[ScenarioName, Scenario]] = {
    s.name: s
    for s in (
        baseline.SCENARIO,
        asap_order.SCENARIO,
        scheduled_pickup.SCENARIO,
        unpaid_order.SCENARIO,
        mx_customer.SCENARIO,
        after_2pm_before_14.SCENARIO,
    )
}

__all__ = ["REGISTRY", "Row", "Scenario", "ScenarioError", "ScenarioName"]
