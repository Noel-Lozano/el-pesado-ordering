import { describe, expect, it } from "vitest";
import { MAX_QUANTITY_PER_LINE, NOTE_MAX_LENGTH } from "@/context/cartReducer";
import { parseStoredCart } from "@/context/cartStorage";

const validLine = {
  menuItemId: 1,
  name: "Frijoles con queso",
  categoryName: "Burritos",
  unitPriceCents: 3000,
  quantity: 2,
  note: "sin cebolla",
};

describe("parseStoredCart", () => {
  it("returns an empty cart when nothing is stored", () => {
    expect(parseStoredCart(null)).toEqual([]);
  });

  it("returns an empty cart for corrupt JSON or a non-array", () => {
    expect(parseStoredCart("{not json")).toEqual([]);
    expect(parseStoredCart(JSON.stringify({ lines: [validLine] }))).toEqual([]);
  });

  it("keeps valid lines", () => {
    expect(parseStoredCart(JSON.stringify([validLine]))).toEqual([validLine]);
  });

  it("drops only the malformed lines", () => {
    const stored = [
      validLine,
      { ...validLine, menuItemId: 2, quantity: 0 },
      { ...validLine, menuItemId: 3, quantity: MAX_QUANTITY_PER_LINE + 1 },
      { ...validLine, menuItemId: 4, unitPriceCents: 30.5 },
      { ...validLine, menuItemId: "5" },
      { ...validLine, menuItemId: 6, note: undefined },
      { ...validLine, menuItemId: 7, categoryName: undefined },
      null,
    ];
    expect(parseStoredCart(JSON.stringify(stored)).map((line) => line.menuItemId)).toEqual([1]);
  });

  it("keeps the first of two lines with the same menuItemId", () => {
    const stored = [validLine, { ...validLine, quantity: 5 }];
    expect(parseStoredCart(JSON.stringify(stored))).toEqual([validLine]);
  });

  it("truncates an over-long stored note", () => {
    const stored = [{ ...validLine, note: "x".repeat(NOTE_MAX_LENGTH + 10) }];
    expect(parseStoredCart(JSON.stringify(stored))[0]?.note).toHaveLength(NOTE_MAX_LENGTH);
  });
});
