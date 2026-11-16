"""Each scenario's build() for fixed `at` values, in and out of DST."""

import re
from datetime import UTC, date, datetime, time
from typing import get_args

import pytest

from pesado_debug.core import shop_time
from pesado_debug.core.scenarios import REGISTRY, ScenarioError, ScenarioName, baseline, scheduled_pickup
from pesado_debug.core.scenarios.base import FAKE_PHONE_PATTERN, ID_BLOCKS, Row
from pesado_debug.core.schema import CHECK_CONSTRAINTS, TABLE_COLUMNS

# Ciudad Juárez follows US DST: UTC-6 in summer, UTC-7 in winter.
SUMMER_TUESDAY = datetime(2026, 7, 14, 16, 0, tzinfo=UTC)  # 10:00 shop time
WINTER_MONDAY = datetime(2026, 11, 16, 17, 0, tzinfo=UTC)  # 10:00 shop time
SUNDAY = datetime(2026, 11, 15, 17, 0, tzinfo=UTC)
FIXED_ATS = [SUMMER_TUESDAY, WINTER_MONDAY]


def test_registry_has_exactly_the_planned_scenarios() -> None:
    assert set(REGISTRY) == set(get_args(ScenarioName))
    assert "blocked_customer" not in REGISTRY  # ADR-007 gap 2
    assert "capacity_full" not in REGISTRY  # ADR-007 gap 3


def _all_rows(at: datetime) -> list[Row]:
    return [row for scenario in REGISTRY.values() for row in scenario.build(at)]


@pytest.mark.parametrize("at", FIXED_ATS)
def test_rows_use_known_columns_and_ids_in_their_block(at: datetime) -> None:
    for row in _all_rows(at):
        assert set(row.values) <= TABLE_COLUMNS[row.table], row
        assert row.id in ID_BLOCKS[row.table], row


@pytest.mark.parametrize("at", FIXED_ATS)
def test_ids_are_unique_across_scenarios(at: datetime) -> None:
    keys = [(row.table, row.id) for row in _all_rows(at)]
    assert len(keys) == len(set(keys))


@pytest.mark.parametrize("at", FIXED_ATS)
def test_enum_values_match_the_check_constraints(at: datetime) -> None:
    for row in _all_rows(at):
        for table, column, allowed in CHECK_CONSTRAINTS.values():
            if row.table == table and row.values.get(column) is not None:
                assert row.values[column] in allowed, (row, column)


@pytest.mark.parametrize("at", FIXED_ATS)
def test_phones_are_obviously_fake_and_unique(at: datetime) -> None:
    phones = [row.values["phone"] for row in _all_rows(at) if row.table == "customers"]
    assert phones
    for phone in phones:
        assert isinstance(phone, str) and re.match(FAKE_PHONE_PATTERN, phone), phone
    assert len(phones) == len(set(phones))


@pytest.mark.parametrize("at", FIXED_ATS)
def test_datetimes_are_timezone_aware(at: datetime) -> None:
    for row in _all_rows(at):
        for value in row.values.values():
            if isinstance(value, datetime):
                assert value.tzinfo is not None, row


@pytest.mark.parametrize("at", FIXED_ATS)
def test_order_totals_and_line_prices(at: datetime) -> None:
    for scenario in REGISTRY.values():
        rows = scenario.build(at)
        for order in (row for row in rows if row.table == "orders"):
            lines = [row for row in rows if row.table == "order_items" and row.values["order_id"] == order.id]
            assert lines, order
            for line in lines:
                menu_id = line.values["menu_item_id"]
                assert isinstance(menu_id, int)
                assert line.values["price_at_order_cents"] == baseline.PRICES_CENTS[menu_id]
            total = sum(
                int(str(line.values["quantity"])) * int(str(line.values["price_at_order_cents"]))
                for line in lines
            )
            assert order.values["total_cents"] == total
            assert order.values["customer_id"] in {r.id for r in rows if r.table == "customers"}


def test_baseline_menu_shape() -> None:
    rows = baseline.build(WINTER_MONDAY)
    menu = {row.id: row.values for row in rows if row.table == "menu_items"}
    assert {(v["category"], v["name"]) for v in menu.values() if v["name"] == "Asado"} == {
        ("Burritos", "Asado"),
        ("Montadas", "Asado"),
    }
    assert menu[baseline.DISCADA_BURRITO]["available_from"] == time(14, 0)
    assert menu[baseline.DISCADA_MONTADA_ZERO_PRICE]["price_cents"] == 0
    assert menu[baseline.AGUA]["category"] == "Extras"
    slots = [row.values for row in rows if row.table == "capacity_slots"]
    assert len(slots) == 3
    assert all(slot["date"] == date(2026, 11, 16) and slot["day_of_week"] is None for slot in slots)


def test_baseline_slot_date_is_the_shop_local_date() -> None:
    # 05:00 UTC on the 17th is still the 16th in Ciudad Juárez.
    rows = baseline.build(datetime(2026, 11, 17, 5, 0, tzinfo=UTC))
    assert {row.values["date"] for row in rows if row.table == "capacity_slots"} == {date(2026, 11, 16)}


def test_asap_order() -> None:
    order = next(r for r in REGISTRY["asap_order"].build(WINTER_MONDAY) if r.table == "orders")
    assert order.values["requested_time"] is None
    assert order.values["fulfillment_type"] == "asap"
    assert order.values["status"] == "created"


@pytest.mark.parametrize("at", FIXED_ATS)
def test_scheduled_pickup_is_same_day_1230_shop_time(at: datetime) -> None:
    order = next(r for r in REGISTRY["scheduled_pickup"].build(at) if r.table == "orders")
    requested = order.values["requested_time"]
    assert isinstance(requested, datetime)
    local = shop_time.to_shop(requested)
    assert local.time() == time(12, 30)
    assert local.date() == shop_time.to_shop(at).date()


def test_scheduled_pickup_default_at_skips_sunday() -> None:
    default = scheduled_pickup.default_at(SUNDAY)
    local = shop_time.to_shop(default)
    assert local.date() == date(2026, 11, 16)  # the next Monday
    assert local.time() == time(10, 0)


@pytest.mark.parametrize(
    ("at", "message"),
    [(SUNDAY, "Sunday"), (datetime(2026, 11, 16, 21, 0, tzinfo=UTC), "after the 12:30 pickup")],
)
def test_scheduled_pickup_refuses_impossible_at(at: datetime, message: str) -> None:
    with pytest.raises(ScenarioError, match=message):
        REGISTRY["scheduled_pickup"].check_at(at)


def test_unpaid_order_is_past_ready() -> None:
    order = next(r for r in REGISTRY["unpaid_order"].build(WINTER_MONDAY) if r.table == "orders")
    assert order.values["status"] == "ready"
    assert order.values["payment_method"] == "cash"
    assert order.values["payment_status"] == "unpaid"
    ready = order.values["estimated_ready_at"]
    assert isinstance(ready, datetime) and ready < WINTER_MONDAY


def test_mx_customer_masks_to_last_four() -> None:
    customer = next(r for r in REGISTRY["mx_customer"].build(WINTER_MONDAY) if r.table == "customers")
    phone = customer.values["phone"]
    assert isinstance(phone, str) and phone.startswith("+52") and phone[-4:] == "0001"


def test_after_2pm_defaults_to_1330_and_orders_the_1400_item() -> None:
    scenario = REGISTRY["after_2pm_before_14"]
    at = scenario.default_at(WINTER_MONDAY)
    assert shop_time.to_shop(at).time() == time(13, 30)
    line = next(r for r in scenario.build(at) if r.table == "order_items")
    assert line.values["menu_item_id"] == baseline.DISCADA_BURRITO
    assert scenario.notes


def test_naive_at_is_rejected() -> None:
    with pytest.raises(ValueError, match="no timezone"):
        baseline.build(datetime(2026, 11, 16, 10, 0))
