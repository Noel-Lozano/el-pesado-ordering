import { describe, expect, it } from "vitest";
import { parseLastOrderId } from "@/lib/lastOrder";

describe("parseLastOrderId", () => {
  it("reads a positive integer id", () => {
    expect(parseLastOrderId("1234")).toBe(1234);
  });

  it("rejects missing, zero, negative and non-numeric values", () => {
    expect(parseLastOrderId(null)).toBeNull();
    expect(parseLastOrderId("0")).toBeNull();
    expect(parseLastOrderId("-3")).toBeNull();
    expect(parseLastOrderId("12abc")).toBeNull();
    expect(parseLastOrderId("")).toBeNull();
  });
});
