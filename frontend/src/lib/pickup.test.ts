import { describe, expect, it } from "vitest";
import {
  getNextOpening,
  getScheduledSlots,
  getShopClock,
  isAsapAvailable,
  isShopOpen,
  latestAvailableFrom,
} from "@/lib/pickup";
import type { ShopInfo } from "@/types/menu";

const shop: ShopInfo = {
  timezone: "America/Ciudad_Juarez",
  hours: [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, open: "07:30", close: "15:30" })),
};

// Ciudad Juárez is UTC-6 until 2026-11-01 (MDT), UTC-7 after (MST).
// 2026-10-28 is a Wednesday; 2026-11-01 is a Sunday.
const wedAt = (localHHMM: string) => new Date(`2026-10-28T${localHHMM}:00-06:00`);

describe("getShopClock", () => {
  it("reads the clock in the shop's timezone, not the device's", () => {
    expect(getShopClock(new Date("2026-10-28T16:05:00Z"), shop.timezone)).toEqual({
      dayOfWeek: 3,
      minutesSinceMidnight: 10 * 60 + 5,
    });
  });

  it("follows the DST change", () => {
    // 16:05 UTC in January is 09:05 local (UTC-7).
    expect(getShopClock(new Date("2027-01-13T16:05:00Z"), shop.timezone).minutesSinceMidnight).toBe(9 * 60 + 5);
  });
});

describe("isShopOpen", () => {
  it("is open from opening time up to (not including) closing time", () => {
    expect(isShopOpen(wedAt("07:29"), shop)).toBe(false);
    expect(isShopOpen(wedAt("07:30"), shop)).toBe(true);
    expect(isShopOpen(wedAt("15:29"), shop)).toBe(true);
    expect(isShopOpen(wedAt("15:30"), shop)).toBe(false);
  });

  it("is closed all day Sunday", () => {
    expect(isShopOpen(new Date("2026-11-01T12:00:00-07:00"), shop)).toBe(false);
  });
});

describe("latestAvailableFrom", () => {
  it("picks the latest time and ignores all-day items", () => {
    expect(latestAvailableFrom([null, "14:00", null])).toBe("14:00");
    expect(latestAvailableFrom([null, null])).toBeNull();
    expect(latestAvailableFrom(["09:30", "14:00", "11:00"])).toBe("14:00");
  });
});

describe("isAsapAvailable", () => {
  it("needs the shop to be open", () => {
    expect(isAsapAvailable(wedAt("10:00"), shop, null)).toBe(true);
    expect(isAsapAvailable(wedAt("16:00"), shop, null)).toBe(false);
  });

  it("waits for the cart's items to be available", () => {
    expect(isAsapAvailable(wedAt("13:59"), shop, "14:00")).toBe(false);
    expect(isAsapAvailable(wedAt("14:00"), shop, "14:00")).toBe(true);
  });
});

describe("getScheduledSlots", () => {
  it("starts at least 30 minutes out, rounded up to a 15-minute step, and ends at closing", () => {
    const slots = getScheduledSlots(wedAt("10:05"), shop, null);
    expect(slots[0]?.clockTime).toBe("10:45");
    expect(slots.at(-1)?.clockTime).toBe("15:30");
    expect(slots.map((slot) => slot.clockTime).slice(0, 3)).toEqual(["10:45", "11:00", "11:15"]);
  });

  it("returns exact instants for each slot", () => {
    const [first] = getScheduledSlots(wedAt("10:05"), shop, null);
    expect(first?.time).toBe(new Date("2026-10-28T10:45:00-06:00").toISOString());
  });

  it("never starts before opening", () => {
    expect(getScheduledSlots(wedAt("05:00"), shop, null)[0]?.clockTime).toBe("07:30");
  });

  it("starts no earlier than the cart's items are available", () => {
    expect(getScheduledSlots(wedAt("09:00"), shop, "14:00")[0]?.clockTime).toBe("14:00");
  });

  it("is empty after closing and on Sundays", () => {
    expect(getScheduledSlots(wedAt("15:10"), shop, null)).toEqual([]);
    expect(getScheduledSlots(new Date("2026-11-01T09:00:00-07:00"), shop, null)).toEqual([]);
  });

  it("works across the DST change", () => {
    const [first] = getScheduledSlots(new Date("2027-01-13T10:05:00-07:00"), shop, null);
    expect(first).toEqual({ clockTime: "10:45", time: new Date("2027-01-13T10:45:00-07:00").toISOString() });
  });
});

describe("getNextOpening", () => {
  it("is later today before opening", () => {
    expect(getNextOpening(wedAt("06:00"), shop)).toEqual({ daysFromToday: 0, dayOfWeek: 3, open: "07:30" });
  });

  it("is tomorrow after closing", () => {
    expect(getNextOpening(wedAt("16:00"), shop)).toEqual({ daysFromToday: 1, dayOfWeek: 4, open: "07:30" });
  });

  it("skips Sunday", () => {
    const saturdayEvening = new Date("2026-10-31T17:00:00-06:00");
    expect(getNextOpening(saturdayEvening, shop)).toEqual({ daysFromToday: 2, dayOfWeek: 1, open: "07:30" });
  });
});
