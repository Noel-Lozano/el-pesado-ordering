"""asap_order: a verified US (+1) customer with an ASAP order in its first status."""

from datetime import datetime

from pesado_debug.core.scenarios import baseline
from pesado_debug.core.scenarios.base import Line, Row, Scenario, customer, order_with_lines

CUSTOMER_ID = 9001
ORDER_ID = 9301
PHONE = "+15005550006"


def build(at: datetime) -> list[Row]:
    price = baseline.PRICES_CENTS[baseline.ASADO_BURRITO]
    return [
        customer(CUSTOMER_ID, PHONE, "Prueba ASAP", at),
        *order_with_lines(
            ORDER_ID,
            CUSTOMER_ID,
            at,
            [Line(9401, baseline.ASADO_BURRITO, 2, price)],
            fulfillment_type="asap",
        ),
    ]


SCENARIO = Scenario(
    name="asap_order",
    description="Verified +1 customer with an ASAP cash order (requested_time NULL), status 'created'.",
    build=build,
)
