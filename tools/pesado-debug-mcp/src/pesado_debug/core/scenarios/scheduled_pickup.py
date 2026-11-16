"""scheduled_pickup: a same-day scheduled order for 12:30 shop time.

Same-day only, because the API only accepts same-day pickups during opening
hours (pickupRules.ts; ADR-007 gap 4). So `at` defaults to 10:00 shop time on
the next open day (today if Mon to Sat), and an explicit `at` after 12:30 or
on a Sunday is refused: either would describe a row the API could never create.
"""

from datetime import datetime, time

from pesado_debug.core import shop_time
from pesado_debug.core.scenarios import baseline
from pesado_debug.core.scenarios.base import (
    Line,
    Row,
    Scenario,
    ScenarioError,
    customer,
    order_with_lines,
)

CUSTOMER_ID = 9002
ORDER_ID = 9302
PHONE = "+15005550007"
PICKUP = time(12, 30)
DEFAULT_AT = time(10, 0)


def default_at(now: datetime) -> datetime:
    day = shop_time.next_open_day(shop_time.to_shop(now).date())
    return shop_time.at_shop_time(day, DEFAULT_AT)


def check_at(at: datetime) -> None:
    local = shop_time.to_shop(at)
    if not shop_time.is_open_day(local.date()):
        raise ScenarioError(f"scheduled_pickup: {local:%Y-%m-%d} is a Sunday; the shop is closed.")
    if local.time() > PICKUP:
        raise ScenarioError(
            f"scheduled_pickup: at {local:%H:%M} shop time is after the 12:30 pickup; "
            "the API only accepts same-day pickups later than now."
        )


def build(at: datetime) -> list[Row]:
    pickup = shop_time.at_shop_time(shop_time.to_shop(at).date(), PICKUP)
    price = baseline.PRICES_CENTS[baseline.ASADO_MONTADA]
    return [
        customer(CUSTOMER_ID, PHONE, "Prueba Programada", at),
        *order_with_lines(
            ORDER_ID,
            CUSTOMER_ID,
            at,
            [Line(9402, baseline.ASADO_MONTADA, 1, price)],
            fulfillment_type="scheduled",
            requested_time=pickup,
        ),
    ]


SCENARIO = Scenario(
    name="scheduled_pickup",
    description="Verified +1 customer with a same-day scheduled cash order for 12:30 shop time.",
    build=build,
    default_at=default_at,
    check_at=check_at,
)
