import { describe, expect, it } from "vitest";
import { formatClockTime } from "@/lib/time";

describe("formatClockTime", () => {
  it("formats on-the-hour times without minutes", () => {
    expect(formatClockTime("14:00")).toBe("2 PM");
    expect(formatClockTime("09:00")).toBe("9 AM");
  });

  it("keeps minutes when present", () => {
    expect(formatClockTime("07:30")).toBe("7:30 AM");
    expect(formatClockTime("15:30")).toBe("3:30 PM");
  });

  it("handles noon and midnight", () => {
    expect(formatClockTime("12:00")).toBe("12 PM");
    expect(formatClockTime("00:15")).toBe("12:15 AM");
  });

  it("rejects malformed input", () => {
    expect(() => formatClockTime("2pm")).toThrow();
    expect(() => formatClockTime("24:00")).toThrow();
  });
});
