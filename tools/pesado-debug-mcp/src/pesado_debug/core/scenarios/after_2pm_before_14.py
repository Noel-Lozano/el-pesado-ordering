"""after_2pm_before_14: at 13:30 shop time, an order line for the 14:00 item.

A row the API would reject (assertItemsAvailableAt in pickupRules.ts). Seeding
it doesn't move the API's clock, which is `new Date()` (ADR-007 gap 5): tests of
the gate still need vi.setSystemTime or resolvePickupMinutes(now, ...).
"""

from datetime import datetime, time

from pesado_debug.core import shop_time
from pesado_debug.core.scenarios import baseline
from pesado_debug.core.scenarios.base import Line, Row, Scenario, customer, order_with_lines

CUSTOMER_ID = 9005
ORDER_ID = 9305
PHONE = "+15005550009"
DEFAULT_AT = time(13, 30)


def default_at(now: datetime) -> datetime:
    return shop_time.at_shop_time(shop_time.to_shop(now).date(), DEFAULT_AT)


def build(at: datetime) -> list[Row]:
    price = baseline.PRICES_CENTS[baseline.DISCADA_BURRITO]
    return [
        customer(CUSTOMER_ID, PHONE, "Prueba Antes de las 2", at),
        *order_with_lines(
            ORDER_ID,
            CUSTOMER_ID,
            at,
            [Line(9406, baseline.DISCADA_BURRITO, 1, price)],
            fulfillment_type="asap",
        ),
    ]


SCENARIO = Scenario(
    name="after_2pm_before_14",
    description="At 13:30 shop time, an ASAP order containing the item available from 14:00.",
    build=build,
    default_at=default_at,
    notes=(
        "A row the API would reject (the 14:00 gate); seeding doesn't move the API's clock, "
        "which still uses new Date().",
    ),
)
