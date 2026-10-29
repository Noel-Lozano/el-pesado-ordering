const CLOCK_TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const HOURS_PER_HALF_DAY = 12;
const NOON_HOUR = 12;

// "14:00" -> "2 PM", "07:30" -> "7:30 AM". Matches how the menu board writes
// times ("Después de las 2 PM").
export function formatClockTime(hhmm: string): string {
  const match = CLOCK_TIME_REGEX.exec(hhmm);
  if (!match) {
    throw new Error(`formatClockTime expects "HH:MM", got "${hhmm}"`);
  }

  const hours = Number(match[1]);
  const minutes = match[2];
  const period = hours >= NOON_HOUR ? "PM" : "AM";
  const displayHour = hours % HOURS_PER_HALF_DAY === 0 ? HOURS_PER_HALF_DAY : hours % HOURS_PER_HALF_DAY;

  return minutes === "00" ? `${displayHour} ${period}` : `${displayHour}:${minutes} ${period}`;
}
