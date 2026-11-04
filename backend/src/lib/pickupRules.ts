import { AppError } from "../middleware/errorHandler.js";
import { SHOP_HOURS, SHOP_TIMEZONE, type ShopDayHours } from "./shopHours.js";

// Server-side pickup rules. The frontend applies the same rules to build its
// pickup picker (frontend/src/lib/pickup.ts), but only this check counts.
//
// - Orders are taken only while the shop is open (same-day pickup only).
// - ASAP = now. Scheduled = a later time today, within opening hours.
// - Items with available_from (e.g. "Después de las 2 PM") can't be picked
//   up before that time.

const MINUTES_PER_HOUR = 60;

export type FulfillmentType = "asap" | "scheduled";

interface ShopClock {
  // "YYYY-MM-DD" in the shop's timezone, to tell whether two instants share a day.
  date: string;
  dayOfWeek: number;
  minutesSinceMidnight: number;
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const shopClockFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: SHOP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function getShopClock(instant: Date): ShopClock {
  const parts = shopClockFormat.formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const dayOfWeek = WEEKDAY_INDEX[part("weekday")];
  if (dayOfWeek === undefined) {
    throw new Error(`Unexpected weekday from Intl: "${part("weekday")}"`);
  }
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    dayOfWeek,
    minutesSinceMidnight: Number(part("hour")) * MINUTES_PER_HOUR + Number(part("minute")),
  };
}

export function clockTimeToMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return (hours ?? 0) * MINUTES_PER_HOUR + (minutes ?? 0);
}

function hoursForDay(dayOfWeek: number): ShopDayHours | undefined {
  return SHOP_HOURS.find((day) => day.dayOfWeek === dayOfWeek);
}

// Validates the requested pickup and returns it as minutes since shop-local
// midnight, for the item availability check.
export function resolvePickupMinutes(now: Date, fulfillmentType: FulfillmentType, requestedTime: Date | null): number {
  const nowClock = getShopClock(now);
  const today = hoursForDay(nowClock.dayOfWeek);
  const isOpen =
    today !== undefined &&
    nowClock.minutesSinceMidnight >= clockTimeToMinutes(today.open) &&
    nowClock.minutesSinceMidnight < clockTimeToMinutes(today.close);

  if (!today || !isOpen) {
    throw new AppError("shop_closed", "The shop is not taking orders right now", 409);
  }

  if (fulfillmentType === "asap") {
    return nowClock.minutesSinceMidnight;
  }

  if (requestedTime === null || requestedTime.getTime() <= now.getTime()) {
    throw new AppError("invalid_pickup_time", "Pickup time must be later today", 400);
  }
  const pickupClock = getShopClock(requestedTime);
  if (
    pickupClock.date !== nowClock.date ||
    pickupClock.minutesSinceMidnight < clockTimeToMinutes(today.open) ||
    pickupClock.minutesSinceMidnight > clockTimeToMinutes(today.close)
  ) {
    throw new AppError("invalid_pickup_time", "Pickup time must be today, within opening hours", 400);
  }
  return pickupClock.minutesSinceMidnight;
}

export interface TimedMenuItem {
  id: number;
  // "HH:MM" or null if available all day.
  availableFrom: string | null;
}

export function assertItemsAvailableAt(pickupMinutes: number, items: TimedMenuItem[]): void {
  const tooEarly = items.find(
    (item) => item.availableFrom !== null && pickupMinutes < clockTimeToMinutes(item.availableFrom),
  );
  if (tooEarly) {
    throw new AppError(
      "item_not_available_yet",
      `Menu item ${tooEarly.id} is only available from ${tooEarly.availableFrom}`,
      409,
    );
  }
}
