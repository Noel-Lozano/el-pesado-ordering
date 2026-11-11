import { type Pickup, toShopClockTime } from "@/lib/pickup";
import { strings } from "@/lib/strings";
import { formatClockTime } from "@/lib/time";

// "Lo antes posible" or "Hoy a las 2:30 PM", in the shop's timezone.
export function describePickup(pickup: Pickup, timezone: string): string {
  if (pickup.kind === "asap") {
    return strings.order.pickupAsap;
  }
  return strings.order.pickupScheduled(formatClockTime(toShopClockTime(new Date(pickup.time), timezone)));
}
