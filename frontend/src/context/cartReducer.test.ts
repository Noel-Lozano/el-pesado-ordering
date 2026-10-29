import { describe, expect, it } from "vitest";
import {
  type CartState,
  cartReducer,
  getCartTotals,
  initialCartState,
  MAX_QUANTITY_PER_LINE,
  NOTE_MAX_LENGTH,
} from "@/context/cartReducer";

const burrito = { menuItemId: 1, name: "Frijoles con queso", categoryName: "Burritos", unitPriceCents: 3000 };
const montada = { menuItemId: 2, name: "Frijoles con queso", categoryName: "Montadas", unitPriceCents: 5000 };

function loadedWith(...items: (typeof burrito)[]): CartState {
  return items.reduce(
    (state, item) => cartReducer(state, { type: "add", item }),
    cartReducer(initialCartState, { type: "load", lines: [] }),
  );
}

describe("cartReducer", () => {
  it("marks the cart loaded with the stored lines", () => {
    const state = cartReducer(initialCartState, {
      type: "load",
      lines: [{ ...burrito, quantity: 2, note: "" }],
    });
    expect(state.hasLoaded).toBe(true);
    expect(state.lines).toHaveLength(1);
  });

  it("adds a new item as a line with quantity 1 and an empty note", () => {
    const state = loadedWith(burrito);
    expect(state.lines).toEqual([{ ...burrito, quantity: 1, note: "" }]);
  });

  it("increments the existing line instead of adding a duplicate, keyed by id", () => {
    const state = loadedWith(burrito, montada, burrito);
    expect(state.lines.map((line) => [line.menuItemId, line.quantity])).toEqual([
      [1, 2],
      [2, 1],
    ]);
  });

  it("keys lines by id, not name: same name, different id stays separate", () => {
    const sameName = { ...burrito, menuItemId: 99 };
    expect(loadedWith(burrito, sameName).lines).toHaveLength(2);
  });

  it("refreshes name and price on add from the latest menu data", () => {
    const repriced = { ...burrito, unitPriceCents: 3500 };
    const state = loadedWith(burrito, repriced);
    expect(state.lines[0]).toMatchObject({ unitPriceCents: 3500, quantity: 2 });
  });

  it("caps quantity at the per-line maximum", () => {
    let state = loadedWith(burrito);
    state = cartReducer(state, { type: "setQuantity", menuItemId: 1, quantity: 500 });
    expect(state.lines[0]?.quantity).toBe(MAX_QUANTITY_PER_LINE);
    state = cartReducer(state, { type: "add", item: burrito });
    expect(state.lines[0]?.quantity).toBe(MAX_QUANTITY_PER_LINE);
  });

  it("removes the line when quantity drops to 0 or below", () => {
    const base = loadedWith(burrito, montada);
    expect(cartReducer(base, { type: "setQuantity", menuItemId: 1, quantity: 0 }).lines).toHaveLength(1);
    expect(cartReducer(base, { type: "setQuantity", menuItemId: 1, quantity: -3 }).lines).toHaveLength(1);
  });

  it("truncates notes to the max length", () => {
    const state = cartReducer(loadedWith(burrito), {
      type: "setNote",
      menuItemId: 1,
      note: "x".repeat(NOTE_MAX_LENGTH + 50),
    });
    expect(state.lines[0]?.note).toHaveLength(NOTE_MAX_LENGTH);
  });

  it("removes a single line and clears all lines", () => {
    const base = loadedWith(burrito, montada);
    expect(cartReducer(base, { type: "remove", menuItemId: 2 }).lines.map((line) => line.menuItemId)).toEqual([1]);
    const cleared = cartReducer(base, { type: "clear" });
    expect(cleared.lines).toEqual([]);
    expect(cleared.hasLoaded).toBe(true);
  });
});

describe("getCartTotals", () => {
  it("sums quantities and centavos", () => {
    const state = cartReducer(loadedWith(burrito, montada), { type: "setQuantity", menuItemId: 1, quantity: 3 });
    expect(getCartTotals(state.lines)).toEqual({ itemCount: 4, subtotalCents: 3 * 3000 + 5000 });
  });

  it("is zero for an empty cart", () => {
    expect(getCartTotals([])).toEqual({ itemCount: 0, subtotalCents: 0 });
  });
});
