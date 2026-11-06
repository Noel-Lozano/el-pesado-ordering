// Opening hours for the shop. Pickup is same-day only, so these bound both
// ASAP orders and scheduled pickup times. Served to the frontend via GET /menu
// so the two never disagree; the backend remains the authority.
export const SHOP_TIMEZONE = "America/Ciudad_Juarez";

// Day of week follows JavaScript / Postgres EXTRACT(DOW): 0 = Sunday ... 6 = Saturday.
// Times are local to SHOP_TIMEZONE, "HH:MM" 24-hour.
export interface ShopDayHours {
  dayOfWeek: number;
  open: string;
  close: string;
}

const WEEKDAY_OPEN = "07:30";
const WEEKDAY_CLOSE = "15:30";

// Monday through Saturday; closed Sunday.
export const SHOP_HOURS: readonly ShopDayHours[] = [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
  dayOfWeek,
  open: WEEKDAY_OPEN,
  close: WEEKDAY_CLOSE,
}));
