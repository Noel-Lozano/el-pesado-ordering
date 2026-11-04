import { describe, expect, it } from "vitest";
import { computeOrderTotal } from "./pricing.js";

const prices = new Map([
  [1, 3000],
  [2, 6500],
]);

describe("computeOrderTotal", () => {
  it("sums database price x quantity in centavos", () => {
    expect(
      computeOrderTotal(
        [
          { menuItemId: 1, quantity: 3 },
          { menuItemId: 2, quantity: 1 },
        ],
        prices,
      ),
    ).toBe(3 * 3000 + 6500);
  });

  it("is 0 for no lines", () => {
    expect(computeOrderTotal([], prices)).toBe(0);
  });

  it("refuses to price an item it has no price for", () => {
    expect(() => computeOrderTotal([{ menuItemId: 99, quantity: 1 }], prices)).toThrow(/99/);
  });
});
