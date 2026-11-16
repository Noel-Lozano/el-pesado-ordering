"""baseline: a small menu fixture plus today's capacity slots.

- A Burrito/Montada pair with the same name (Asado), which only
  UNIQUE(category, name) tells apart.
- An item available from 14:00 ("Después de las 2 PM").
- An Extras drink.
- An item with price_cents = 0 (the Discada-style bad data GET /menu hides
  and POST /orders rejects).

Not loaded together with seed:menu's real menu: both have Burritos/Asado
(ADR-007 gap 12).
"""

from datetime import datetime, time

from pesado_debug.core import shop_time
from pesado_debug.core.scenarios.base import Row, Scenario, menu_item

ASADO_BURRITO = 9101
ASADO_MONTADA = 9102
DISCADA_BURRITO = 9103
AGUA = 9104
DISCADA_MONTADA_ZERO_PRICE = 9105

PRICES_CENTS: dict[int, int] = {
    ASADO_BURRITO: 4500,
    ASADO_MONTADA: 6500,
    DISCADA_BURRITO: 6500,
    AGUA: 1000,
    DISCADA_MONTADA_ZERO_PRICE: 0,
}

AFTER_2PM = time(14, 0)
AFTER_2PM_CATEGORY = "Después de las 2 PM"

SLOT_IDS = (9201, 9202, 9203)
SLOT_TIMES = ((time(12, 0), time(12, 15)), (time(12, 15), time(12, 30)), (time(12, 30), time(12, 45)))
SLOT_MAX_ORDERS = 5


def build(at: datetime) -> list[Row]:
    p = PRICES_CENTS
    menu = [
        menu_item(ASADO_BURRITO, "Burritos", "Asado", p[ASADO_BURRITO], 10, at),
        menu_item(ASADO_MONTADA, "Montadas", "Asado", p[ASADO_MONTADA], 10, at),
        menu_item(
            DISCADA_BURRITO,
            AFTER_2PM_CATEGORY,
            "Burrito de Discada",
            p[DISCADA_BURRITO],
            10,
            at,
            available_from=AFTER_2PM,
        ),
        menu_item(AGUA, "Extras", "Agua", p[AGUA], 10, at),
        menu_item(
            DISCADA_MONTADA_ZERO_PRICE,
            AFTER_2PM_CATEGORY,
            "Montada de Discada",
            p[DISCADA_MONTADA_ZERO_PRICE],
            20,
            at,
            available_from=AFTER_2PM,
        ),
    ]
    shop_date = shop_time.to_shop(at).date()
    slots = [
        Row(
            "capacity_slots",
            {
                "id": slot_id,
                "date": shop_date,
                "day_of_week": None,
                "start_time": start,
                "end_time": end,
                "max_orders": SLOT_MAX_ORDERS,
                "created_at": at,
                "updated_at": at,
            },
        )
        for slot_id, (start, end) in zip(SLOT_IDS, SLOT_TIMES, strict=True)
    ]
    return [*menu, *slots]


SCENARIO = Scenario(
    name="baseline",
    description=(
        "Small menu (same-name Asado burrito/montada, a 14:00 item, a drink, a zero-price row) "
        "and three 15-minute capacity slots on the shop-local date of `at`."
    ),
    build=build,
)
