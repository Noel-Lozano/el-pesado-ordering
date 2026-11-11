import { clockTimeToMinutes, getShopClock } from "@/lib/pickup";

// Whether an item with this "available from" time ("14:00") can be added to
// the cart right now, judged in the shop's timezone. Items sold all day
// (null) always can. `now` is null during the server render, so time-gated
// items start disabled and enable after hydration, without a mismatch.
// The server enforces the same rule (409 item_not_available_yet).
export function isAvailableNow(availableFrom: string | null, now: Date | null, timezone: string): boolean {
  if (availableFrom === null) return true;
  if (now === null) return false;
  return getShopClock(now, timezone).minutesSinceMidnight >= clockTimeToMinutes(availableFrom);
}
