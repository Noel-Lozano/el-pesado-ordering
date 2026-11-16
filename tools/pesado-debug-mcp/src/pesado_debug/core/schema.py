"""The app schema as this tool knows it, copied from backend/migrations 01-07.

Python can't import the backend's TypeScript, so these constants are the main
drift risk (ADR-007). tests/integration/test_schema_drift.py compares them with
a freshly migrated database (columns from information_schema, enum values from
the CHECK constraints) and fails CI when a migration changes either.
"""

from typing import Final, Literal, get_args

TableName = Literal["customers", "menu_items", "capacity_slots", "orders", "order_items"]

# Every column of every app table in `public` (pgmigrations excluded).
TABLE_COLUMNS: Final[dict[TableName, frozenset[str]]] = {
    "customers": frozenset(
        {"id", "phone", "phone_verified", "name", "no_show_count", "is_blocked", "created_at", "updated_at"}
    ),
    "menu_items": frozenset(
        {
            "id",
            "name",
            "description",
            "price_cents",
            "image_url",
            "category",
            "is_available",
            "display_order",
            "available_from",
            "created_at",
            "updated_at",
        }
    ),
    "capacity_slots": frozenset(
        {"id", "day_of_week", "date", "start_time", "end_time", "max_orders", "created_at", "updated_at"}
    ),
    "orders": frozenset(
        {
            "id",
            "customer_id",
            "channel",
            "status",
            "fulfillment_type",
            "requested_time",
            "estimated_ready_at",
            "payment_method",
            "payment_status",
            "currency_paid",
            "total_cents",
            "idempotency_key",
            "created_at",
            "updated_at",
        }
    ),
    "order_items": frozenset(
        {"id", "order_id", "menu_item_id", "quantity", "price_at_order_cents", "notes", "created_at"}
    ),
}

# Foreign-key order: a table only references tables before it.
INSERT_ORDER: Final[tuple[TableName, ...]] = (
    "customers",
    "menu_items",
    "capacity_slots",
    "orders",
    "order_items",
)

MIGRATIONS_TABLE: Final = "pgmigrations"

OrderStatus = Literal["created", "confirmed", "preparing", "ready", "picked_up", "no_show", "cancelled"]
PaymentStatus = Literal["unpaid", "awaiting_payment", "paid"]
PaymentMethod = Literal["card", "bank_transfer", "cash"]  # oxxo dropped in migration 07 (ADR-006)
FulfillmentType = Literal["asap", "scheduled"]
Channel = Literal["online", "phone", "in_store"]
CurrencyPaid = Literal["MXN", "USD"]

# CHECK constraint name -> (table, column, allowed values).
CHECK_CONSTRAINTS: Final[dict[str, tuple[TableName, str, tuple[str, ...]]]] = {
    "orders_status_check": ("orders", "status", get_args(OrderStatus)),
    "orders_payment_status_check": ("orders", "payment_status", get_args(PaymentStatus)),
    "orders_payment_method_check": ("orders", "payment_method", get_args(PaymentMethod)),
    "orders_fulfillment_type_check": ("orders", "fulfillment_type", get_args(FulfillmentType)),
    "orders_channel_check": ("orders", "channel", get_args(Channel)),
    "orders_currency_paid_check": ("orders", "currency_paid", get_args(CurrencyPaid)),
}
