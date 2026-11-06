import { describe, expect, it } from "vitest";
import { maskPhone, normalizePhone, splitE164 } from "@/lib/phone";

describe("normalizePhone (MX)", () => {
  it("accepts a 10-digit national number with any formatting", () => {
    expect(normalizePhone("664 123 4567", "MX")).toBe("+526641234567");
    expect(normalizePhone("(656) 123-4567", "MX")).toBe("+526561234567");
  });

  it("accepts the number with its country code", () => {
    expect(normalizePhone("+52 664 123 4567", "MX")).toBe("+526641234567");
    expect(normalizePhone("526641234567", "MX")).toBe("+526641234567");
  });

  it("strips the legacy +52 1 mobile prefix", () => {
    expect(normalizePhone("+52 1 664 123 4567", "MX")).toBe("+526641234567");
  });

  it("rejects wrong lengths and impossible area codes", () => {
    expect(normalizePhone("664 123 456", "MX")).toBeNull();
    expect(normalizePhone("664 123 45678", "MX")).toBeNull();
    expect(normalizePhone("064 123 4567", "MX")).toBeNull();
    expect(normalizePhone("", "MX")).toBeNull();
  });
});

describe("normalizePhone (US)", () => {
  it("accepts a 10-digit number, with or without the leading 1", () => {
    expect(normalizePhone("(915) 555-2368", "US")).toBe("+19155552368");
    expect(normalizePhone("1 915 555 2368", "US")).toBe("+19155552368");
    expect(normalizePhone("+1-915-555-2368", "US")).toBe("+19155552368");
  });

  it("rejects numbers that break NANP rules", () => {
    expect(normalizePhone("115 555 2368", "US")).toBeNull();
    expect(normalizePhone("915 155 2368", "US")).toBeNull();
    expect(normalizePhone("915 555 236", "US")).toBeNull();
  });

  it("does not silently reinterpret a Mexican number as US", () => {
    expect(normalizePhone("+52 664 123 4567", "US")).toBeNull();
  });
});

describe("maskPhone", () => {
  it("shows only the last 4 digits", () => {
    expect(maskPhone("+526641234567")).toBe("•••• 4567");
  });
});

describe("splitE164", () => {
  it("splits +52 and +1 numbers back into country and national number", () => {
    expect(splitE164("+526561234567")).toEqual({ country: "MX", nationalNumber: "6561234567" });
    expect(splitE164("+19155552368")).toEqual({ country: "US", nationalNumber: "9155552368" });
  });

  it("returns null for other countries or lengths", () => {
    expect(splitE164("+447700900123")).toBeNull();
    expect(splitE164("+5265612345")).toBeNull();
  });
});
