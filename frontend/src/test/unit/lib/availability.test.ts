import { describe, expect, it } from "vitest";
import { isAvailableNow } from "@/lib/availability";

const TIMEZONE = "America/Ciudad_Juarez";
// Ciudad Juárez is UTC-7 (no DST since 2022).
const AT_1359 = new Date("2026-11-10T20:59:00Z");
const AT_1400 = new Date("2026-11-10T21:00:00Z");

describe("isAvailableNow", () => {
  it("always allows items sold all day, even before hydration", () => {
    expect(isAvailableNow(null, null, TIMEZONE)).toBe(true);
    expect(isAvailableNow(null, AT_1359, TIMEZONE)).toBe(true);
  });

  it("blocks a 2 PM item before 14:00 shop time and allows it from 14:00", () => {
    expect(isAvailableNow("14:00", AT_1359, TIMEZONE)).toBe(false);
    expect(isAvailableNow("14:00", AT_1400, TIMEZONE)).toBe(true);
  });

  it("treats an unknown time (server render) as not yet available", () => {
    expect(isAvailableNow("14:00", null, TIMEZONE)).toBe(false);
  });
});
