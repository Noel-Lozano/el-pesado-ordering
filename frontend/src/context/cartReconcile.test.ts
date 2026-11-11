import { describe, expect, it } from "vitest";
import { reconcileCart } from "@/context/cartReconcile";
import type { CartLine } from "@/context/cartReducer";
import type { MenuCategory } from "@/types/menu";

const MENU: MenuCategory[] = [
  {
    name: "Burritos",
    items: [{ id: 1, name: "Asado", description: null, priceCents: 4500, imageUrl: null, availableFrom: null }],
  },
];

function line(overrides: Partial<CartLine>): CartLine {
  return { menuItemId: 1, name: "Asado", categoryName: "Burritos", unitPriceCents: 4500, quantity: 2, note: "", ...overrides };
}

describe("reconcileCart", () => {
  it("leaves a cart that matches the menu untouched", () => {
    const lines = [line({})];
    const result = reconcileCart(lines, MENU);
    expect(result.hasChanged).toBe(false);
    expect(result.lines).toEqual(lines);
    expect(result.droppedNames).toEqual([]);
  });

  it("drops lines whose item is gone and reports their names", () => {
    const result = reconcileCart([line({}), line({ menuItemId: 99, name: "Discada" })], MENU);
    expect(result.lines.map((kept) => kept.menuItemId)).toEqual([1]);
    expect(result.droppedNames).toEqual(["Discada"]);
    expect(result.hasChanged).toBe(true);
  });

  it("refreshes price and name, keeping quantity and note", () => {
    const result = reconcileCart([line({ unitPriceCents: 4000, name: "Asado viejo", note: "sin cebolla" })], MENU);
    expect(result.lines).toEqual([line({ note: "sin cebolla" })]);
    expect(result.hasChanged).toBe(true);
  });
});
