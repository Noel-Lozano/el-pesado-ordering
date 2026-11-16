"""Shop-local time. Mirrors backend/src/lib/shopHours.ts.

Scenario times are computed from an explicit `at`, in the shop's timezone,
never from the machine's local clock. Everything returned is timezone-aware.
"""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

SHOP_TZ = ZoneInfo("America/Ciudad_Juarez")
OPEN = time(7, 30)
CLOSE = time(15, 30)
SUNDAY = 6  # date.weekday(): Monday = 0 ... Sunday = 6; the shop is closed Sundays.


class NaiveDatetimeError(ValueError):
    pass


def to_shop(at: datetime) -> datetime:
    if at.tzinfo is None:
        raise NaiveDatetimeError(f"{at.isoformat()} has no timezone")
    return at.astimezone(SHOP_TZ)


def at_shop_time(day: date, clock: time) -> datetime:
    """A wall-clock time on a shop-local date (DST-aware)."""
    return datetime.combine(day, clock, tzinfo=SHOP_TZ)


def is_open_day(day: date) -> bool:
    return day.weekday() != SUNDAY


def next_open_day(day: date) -> date:
    """`day` itself if the shop opens that day, else the following open day."""
    while not is_open_day(day):
        day += timedelta(days=1)
    return day
