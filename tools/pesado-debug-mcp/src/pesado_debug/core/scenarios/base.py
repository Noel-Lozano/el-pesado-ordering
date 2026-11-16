"""Building blocks for scenarios: rows, fixed ID blocks, and row helpers.

IDs are `serial` integers in this schema, not UUIDs (ADR-007 gap 1), so each
table gets a reserved block of fixed IDs. Reset restarts the sequences at 1, so
rows the app creates afterwards never collide with these.
"""

from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import datetime, time
from typing import Final, Literal

from pesado_debug.core.schema import (
    Channel,
    FulfillmentType,
    OrderStatus,
    PaymentMethod,
    PaymentStatus,
    TableName,
)

ScenarioName = Literal[
    "baseline", "asap_order", "scheduled_pickup", "unpaid_order", "mx_customer", "after_2pm_before_14"
]

ID_BLOCKS: Final[dict[TableName, range]] = {
    "customers": range(9001, 9100),
    "menu_items": range(9101, 9200),
    "capacity_slots": range(9201, 9300),
    "orders": range(9301, 9400),
    "order_items": range(9401, 9500),
}

# Obviously fake numbers only: Twilio's +1 500 555 magic range and a +52 656 555 range.
FAKE_PHONE_PATTERN: Final = r"^\+1500555\d{4}$|^\+52656555\d{4}$"


class ScenarioError(ValueError):
    """A scenario can't be built for the given `at`."""


@dataclass(frozen=True)
class Row:
    table: TableName
    values: Mapping[str, object]

    @property
    def id(self) -> int:
        value = self.values["id"]
        if not isinstance(value, int):
            raise ScenarioError(f"{self.table} row has a non-integer id: {value!r}")
        return value


def _now_default(now: datetime) -> datetime:
    return now


def _accept_any(at: datetime) -> None:
    return None


@dataclass(frozen=True)
class Scenario:
    name: ScenarioName
    description: str
    build: Callable[[datetime], list[Row]]
    # The `at` used when the caller gives none, computed from "now".
    default_at: Callable[[datetime], datetime] = _now_default
    # Raises ScenarioError when an explicit `at` would make an invalid scenario.
    check_at: Callable[[datetime], None] = _accept_any
    notes: tuple[str, ...] = field(default=())


# --- Row helpers ---------------------------------------------------------------


def customer(
    id: int, phone: str, name: str, at: datetime, *, no_show_count: int = 0, is_blocked: bool = False
) -> Row:
    return Row(
        "customers",
        {
            "id": id,
            "phone": phone,
            "phone_verified": True,
            "name": name,
            "no_show_count": no_show_count,
            "is_blocked": is_blocked,
            "created_at": at,
            "updated_at": at,
        },
    )


def menu_item(
    id: int,
    category: str,
    name: str,
    price_cents: int,
    display_order: int,
    at: datetime,
    *,
    available_from: time | None = None,
    description: str | None = None,
) -> Row:
    return Row(
        "menu_items",
        {
            "id": id,
            "category": category,
            "name": name,
            "description": description,
            "price_cents": price_cents,
            "is_available": True,
            "display_order": display_order,
            "available_from": available_from,
            "created_at": at,
            "updated_at": at,
        },
    )


@dataclass(frozen=True)
class Line:
    item_id: int
    menu_item_id: int
    quantity: int
    unit_price_cents: int
    notes: str | None = None


def order_with_lines(
    id: int,
    customer_id: int,
    at: datetime,
    lines: list[Line],
    *,
    fulfillment_type: FulfillmentType,
    status: OrderStatus = "created",
    payment_method: PaymentMethod = "cash",
    payment_status: PaymentStatus = "unpaid",
    channel: Channel = "online",
    requested_time: datetime | None = None,
    estimated_ready_at: datetime | None = None,
) -> list[Row]:
    """An order and its lines. total_cents is the sum of the lines, as POST /orders computes it."""
    total_cents = sum(line.quantity * line.unit_price_cents for line in lines)
    order = Row(
        "orders",
        {
            "id": id,
            "customer_id": customer_id,
            "channel": channel,
            "status": status,
            "fulfillment_type": fulfillment_type,
            "requested_time": requested_time,
            "estimated_ready_at": estimated_ready_at,
            "payment_method": payment_method,
            "payment_status": payment_status,
            "total_cents": total_cents,
            "created_at": at,
            "updated_at": at,
        },
    )
    items = [
        Row(
            "order_items",
            {
                "id": line.item_id,
                "order_id": id,
                "menu_item_id": line.menu_item_id,
                "quantity": line.quantity,
                "price_at_order_cents": line.unit_price_cents,
                "notes": line.notes,
                "created_at": at,
            },
        )
        for line in lines
    ]
    return [order, *items]
