import type { NextOpening } from "@/lib/pickup";
import { strings } from "@/lib/strings";
import { formatClockTime } from "@/lib/time";

// "Abrimos mañana a las 7:30 AM." Shared by the menu's closed banner and checkout.
export function describeNextOpening(next: NextOpening): string {
  const when =
    next.daysFromToday === 0
      ? strings.checkout.today
      : next.daysFromToday === 1
        ? strings.checkout.tomorrow
        : (strings.checkout.dayNames[next.dayOfWeek] ?? "");
  return strings.checkout.nextOpening(when, formatClockTime(next.open));
}
