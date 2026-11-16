"""mx_customer: a verified Mexican (+52) customer with one order, for E.164 handling and masking."""

from datetime import datetime

from pesado_debug.core.scenarios import baseline
from pesado_debug.core.scenarios.base import Line, Row, Scenario, customer, order_with_lines

CUSTOMER_ID = 9004
ORDER_ID = 9304
PHONE = "+526565550001"


def build(at: datetime) -> list[Row]:
    return [
        customer(CUSTOMER_ID, PHONE, "Prueba MX", at),
        *order_with_lines(
            ORDER_ID,
            CUSTOMER_ID,
            at,
            [Line(9405, baseline.AGUA, 1, baseline.PRICES_CENTS[baseline.AGUA])],
            fulfillment_type="asap",
        ),
    ]


SCENARIO = Scenario(
    name="mx_customer",
    description="Verified +52 customer (masked as ...0001) with one ASAP cash order.",
    build=build,
)
