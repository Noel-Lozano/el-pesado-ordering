import type { ShopDayHours, ShopInfo } from "@/types/menu";

// Pickup is same-day only, within the shop's opening hours. All "clock"
// reasoning happens in the shop's timezone (served by GET /menu), never the
// customer's device timezone: a phone set to US time must still see Juárez
// pickup times. The backend re-checks everything; this is for the UI.

export const SLOT_INTERVAL_MINUTES = 15;
export const MIN_LEAD_TIME_MINUTES = 30;
const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const DAYS_PER_WEEK = 7;

export type Pickup = { kind: "asap" } | { kind: "scheduled"; time: string };

export interface ScheduledSlot {
  // ISO 8601 instant sent to the API as requestedTime.
  time: string;
  // "HH:MM" in the shop's timezone, for display.
  clockTime: string;
}

interface ShopClock {
  dayOfWeek: number;
  minutesSinceMidnight: number;
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function getShopClock(now: Date, timezone: string): ShopClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";

  const dayOfWeek = WEEKDAY_INDEX[part("weekday")];
  if (dayOfWeek === undefined) {
    throw new Error(`Unexpected weekday from Intl: "${part("weekday")}"`);
  }
  return { dayOfWeek, minutesSinceMidnight: Number(part("hour")) * MINUTES_PER_HOUR + Number(part("minute")) };
}

export function clockTimeToMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return (hours ?? 0) * MINUTES_PER_HOUR + (minutes ?? 0);
}

function minutesToClockTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const minutes = totalMinutes % MINUTES_PER_HOUR;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

// "HH:MM" in the shop's timezone for an instant, e.g. a scheduled pickup's
// ISO time, for display.
export function toShopClockTime(instant: Date, timezone: string): string {
  return minutesToClockTime(getShopClock(instant, timezone).minutesSinceMidnight);
}

function hoursForDay(shop: ShopInfo, dayOfWeek: number): ShopDayHours | undefined {
  return shop.hours.find((day) => day.dayOfWeek === dayOfWeek);
}

export function isShopOpen(now: Date, shop: ShopInfo): boolean {
  const clock = getShopClock(now, shop.timezone);
  const today = hoursForDay(shop, clock.dayOfWeek);
  return (
    today !== undefined &&
    clock.minutesSinceMidnight >= clockTimeToMinutes(today.open) &&
    clock.minutesSinceMidnight < clockTimeToMinutes(today.close)
  );
}

// The latest "available from" time among the cart's items, e.g. "14:00" if
// the cart contains anything from "Después de las 2 PM".
export function latestAvailableFrom(times: (string | null)[]): string | null {
  return times.reduce<string | null>((latest, time) => {
    if (time === null) return latest;
    return latest === null || clockTimeToMinutes(time) > clockTimeToMinutes(latest) ? time : latest;
  }, null);
}

export function isAsapAvailable(now: Date, shop: ShopInfo, itemsAvailableFrom: string | null): boolean {
  if (!isShopOpen(now, shop)) {
    return false;
  }
  if (itemsAvailableFrom === null) {
    return true;
  }
  return getShopClock(now, shop.timezone).minutesSinceMidnight >= clockTimeToMinutes(itemsAvailableFrom);
}

function roundUpToInterval(minutes: number, interval: number): number {
  return Math.ceil(minutes / interval) * interval;
}

// Today's pickup slots in 15-minute steps: no sooner than 30 minutes from
// now, not before opening or before the cart's items are available, and no
// later than closing.
export function getScheduledSlots(now: Date, shop: ShopInfo, itemsAvailableFrom: string | null): ScheduledSlot[] {
  const clock = getShopClock(now, shop.timezone);
  const today = hoursForDay(shop, clock.dayOfWeek);
  if (!today) {
    return [];
  }

  const earliest = Math.max(
    clockTimeToMinutes(today.open),
    roundUpToInterval(clock.minutesSinceMidnight + MIN_LEAD_TIME_MINUTES, SLOT_INTERVAL_MINUTES),
    itemsAvailableFrom === null ? 0 : roundUpToInterval(clockTimeToMinutes(itemsAvailableFrom), SLOT_INTERVAL_MINUTES),
  );
  const latest = clockTimeToMinutes(today.close);

  // Shop-local midnight as an instant. Safe to do with fixed offsets because
  // the shop's DST changes happen at 2 AM, outside opening hours.
  const localMidnightMs =
    now.getTime() -
    clock.minutesSinceMidnight * MS_PER_MINUTE -
    now.getUTCSeconds() * 1000 -
    now.getUTCMilliseconds();

  const slots: ScheduledSlot[] = [];
  for (let minutes = earliest; minutes <= latest; minutes += SLOT_INTERVAL_MINUTES) {
    slots.push({
      time: new Date(localMidnightMs + minutes * MS_PER_MINUTE).toISOString(),
      clockTime: minutesToClockTime(minutes),
    });
  }
  return slots;
}

export interface NextOpening {
  // 0 = later today, 1 = tomorrow, ...
  daysFromToday: number;
  dayOfWeek: number;
  open: string;
}

export function getNextOpening(now: Date, shop: ShopInfo): NextOpening | null {
  const clock = getShopClock(now, shop.timezone);

  for (let offset = 0; offset <= DAYS_PER_WEEK; offset++) {
    const dayOfWeek = (clock.dayOfWeek + offset) % DAYS_PER_WEEK;
    const day = hoursForDay(shop, dayOfWeek);
    if (!day) continue;
    if (offset === 0 && clock.minutesSinceMidnight >= clockTimeToMinutes(day.open)) continue;
    return { daysFromToday: offset, dayOfWeek, open: day.open };
  }
  return null;
}
