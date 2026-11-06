import { describe, expect, it } from "vitest";
import { AppError } from "../middleware/errorHandler.js";
import { assertItemsAvailableAt, resolvePickupMinutes } from "./pickupRules.js";

// Shop: America/Ciudad_Juarez, Mon–Sat 07:30–15:30. UTC-6 until 2026-11-01.
// 2026-10-28 is a Wednesday; 2026-11-01 is a Sunday.
const wedAt = (hhmm: string) => new Date(`2026-10-28T${hhmm}:00-06:00`);
const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

function errorCode(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof AppError ? err.code : "not_app_error";
  }
}

describe("resolvePickupMinutes", () => {
  it("ASAP while open returns now in shop time", () => {
    expect(resolvePickupMinutes(wedAt("10:05"), "asap", null)).toBe(minutes("10:05"));
  });

  it("rejects any order while closed", () => {
    expect(errorCode(() => resolvePickupMinutes(wedAt("07:29"), "asap", null))).toBe("shop_closed");
    expect(errorCode(() => resolvePickupMinutes(wedAt("15:30"), "asap", null))).toBe("shop_closed");
    expect(errorCode(() => resolvePickupMinutes(new Date("2026-11-01T10:00:00-07:00"), "asap", null))).toBe(
      "shop_closed",
    );
    // Even a valid-looking scheduled time can't be booked before opening.
    expect(errorCode(() => resolvePickupMinutes(wedAt("06:00"), "scheduled", wedAt("09:00")))).toBe("shop_closed");
  });

  it("accepts a later time today up to and including closing", () => {
    expect(resolvePickupMinutes(wedAt("10:05"), "scheduled", wedAt("11:30"))).toBe(minutes("11:30"));
    expect(resolvePickupMinutes(wedAt("10:05"), "scheduled", wedAt("15:30"))).toBe(minutes("15:30"));
  });

  it("rejects past, after-closing, missing, or other-day pickup times", () => {
    expect(errorCode(() => resolvePickupMinutes(wedAt("10:05"), "scheduled", wedAt("10:00")))).toBe(
      "invalid_pickup_time",
    );
    expect(errorCode(() => resolvePickupMinutes(wedAt("10:05"), "scheduled", wedAt("15:45")))).toBe(
      "invalid_pickup_time",
    );
    expect(errorCode(() => resolvePickupMinutes(wedAt("10:05"), "scheduled", null))).toBe("invalid_pickup_time");
    expect(
      errorCode(() => resolvePickupMinutes(wedAt("10:05"), "scheduled", new Date("2026-10-29T10:00:00-06:00"))),
    ).toBe("invalid_pickup_time");
  });

  it("reads a UTC instant in shop time", () => {
    // 21:00 UTC is 15:00 in Ciudad Juárez on 2026-10-28: within hours.
    expect(resolvePickupMinutes(wedAt("10:05"), "scheduled", new Date("2026-10-28T21:00:00Z"))).toBe(
      minutes("15:00"),
    );
  });
});

describe("assertItemsAvailableAt", () => {
  const allDay = { id: 1, availableFrom: null };
  const afterTwo = { id: 2, availableFrom: "14:00" };

  it("allows all-day items any time and timed items from their start", () => {
    expect(errorCode(() => assertItemsAvailableAt(minutes("08:00"), [allDay]))).toBeNull();
    expect(errorCode(() => assertItemsAvailableAt(minutes("14:00"), [allDay, afterTwo]))).toBeNull();
  });

  it("rejects timed items before their start", () => {
    expect(errorCode(() => assertItemsAvailableAt(minutes("13:59"), [allDay, afterTwo]))).toBe(
      "item_not_available_yet",
    );
  });
});
