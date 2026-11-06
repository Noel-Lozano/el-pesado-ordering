import { describe, expect, it } from "vitest";
import { formatMXN } from "@/lib/money";

describe("formatMXN", () => {
  it("drops centavos for whole-peso amounts", () => {
    expect(formatMXN(3000)).toBe("$30");
    expect(formatMXN(0)).toBe("$0");
  });

  it("shows two decimals when there are centavos", () => {
    expect(formatMXN(4550)).toBe("$45.50");
    expect(formatMXN(5)).toBe("$0.05");
  });

  it("groups thousands", () => {
    expect(formatMXN(123_456)).toBe("$1,234.56");
    expect(formatMXN(1_000_000)).toBe("$10,000");
  });

  it("rejects non-integer centavos", () => {
    expect(() => formatMXN(30.5)).toThrow();
  });
});
