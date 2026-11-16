"""unpaid_order: a ready cash order, unpaid, whose estimated_ready_at has passed (the no-show path).

The grace period before a no-show is not defined yet (architecture.md §8), so
estimated_ready_at = at - 30 min is a fixture value, not a rule (ADR-007 gap 8).
"""

from datetime import datetime, timedelta

from pesado_debug.core.scenarios import baseline
from pesado_debug.core.scenarios.base import Line, Row, Scenario, customer, order_with_lines

CUSTOMER_ID = 9003
ORDER_ID = 9303
PHONE = "+15005550008"
READY_AGO = timedelta(minutes=30)


def build(at: datetime) -> list[Row]:
    p = baseline.PRICES_CENTS
    return [
        customer(CUSTOMER_ID, PHONE, "Prueba Sin Pagar", at),
        *order_with_lines(
            ORDER_ID,
            CUSTOMER_ID,
            at,
            [
                Line(9403, baseline.ASADO_BURRITO, 1, p[baseline.ASADO_BURRITO]),
                Line(9404, baseline.AGUA, 1, p[baseline.AGUA]),
            ],
            fulfillment_type="asap",
            status="ready",
            payment_status="unpaid",
            estimated_ready_at=at - READY_AGO,
        ),
    ]


SCENARIO = Scenario(
    name="unpaid_order",
    description=(
        "Cash order in status 'ready', payment_status 'unpaid', estimated_ready_at 30 min before `at`."
    ),
    build=build,
    notes=("estimated_ready_at = at - 30 min is a fixture value; no grace period is defined yet.",),
)
