// Pure cart logic, kept free of React so it can be unit tested directly.
// Lines are keyed by menuItemId, never by name (ADR-002 decision 4).
// unitPriceCents is for display only; the backend recomputes every total.

export const MAX_QUANTITY_PER_LINE = 20;
export const NOTE_MAX_LENGTH = 140;

export interface CartLine {
  menuItemId: number;
  name: string;
  // Several items share a name across categories (a "Frijoles con queso"
  // burrito and montada), so the category is kept to tell lines apart.
  categoryName: string;
  unitPriceCents: number;
  quantity: number;
  note: string;
}

export interface CartState {
  lines: CartLine[];
  // False until the saved cart has been read from storage after mount. Until
  // then the UI shouldn't claim the cart is empty, and nothing is saved, so
  // the stored cart isn't overwritten by the initial empty state.
  hasLoaded: boolean;
}

export interface CartItemInput {
  menuItemId: number;
  name: string;
  categoryName: string;
  unitPriceCents: number;
}

export type CartAction =
  | { type: "load"; lines: CartLine[] }
  // quantity defaults to 1 and note to "" (the menu's "+" button).
  | { type: "add"; item: CartItemInput; quantity?: number; note?: string }
  | { type: "setQuantity"; menuItemId: number; quantity: number }
  | { type: "setNote"; menuItemId: number; note: string }
  | { type: "remove"; menuItemId: number }
  // After re-validating against the latest menu (see cartReconcile.ts).
  | { type: "replaceLines"; lines: CartLine[] }
  | { type: "clear" };

export const initialCartState: CartState = { lines: [], hasLoaded: false };

function clampQuantity(quantity: number): number {
  return Math.min(Math.max(Math.trunc(quantity), 0), MAX_QUANTITY_PER_LINE);
}

function normalizeNote(note: string): string {
  return note.trim().slice(0, NOTE_MAX_LENGTH);
}

// True when adding this item with this note would overwrite a different note
// already on its line, so the UI can tell the customer (ADR-004 §2).
export function willReplaceNote(lines: CartLine[], menuItemId: number, note: string): boolean {
  const existing = lines.find((line) => line.menuItemId === menuItemId);
  const newNote = normalizeNote(note);
  return existing !== undefined && existing.note !== "" && newNote !== "" && existing.note !== newNote;
}

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "load":
      return { lines: action.lines, hasLoaded: true };

    case "add": {
      const addedQuantity = Math.max(1, clampQuantity(action.quantity ?? 1));
      const addedNote = normalizeNote(action.note ?? "");
      const existing = state.lines.find((line) => line.menuItemId === action.item.menuItemId);
      if (!existing) {
        const newLine: CartLine = { ...action.item, quantity: addedQuantity, note: addedNote };
        return { ...state, lines: [...state.lines, newLine] };
      }
      // Lines are keyed by item id only (the API rejects the same item twice
      // in one order, ADR-004 §2): adding again sums the quantity, and a new
      // non-empty note replaces the old one; an empty note keeps it.
      return {
        ...state,
        lines: state.lines.map((line) =>
          line.menuItemId === action.item.menuItemId
            ? {
                // Refresh name and price from the latest menu data while we're here.
                ...line,
                ...action.item,
                quantity: clampQuantity(line.quantity + addedQuantity),
                note: addedNote === "" ? line.note : addedNote,
              }
            : line,
        ),
      };
    }

    case "setQuantity": {
      const quantity = clampQuantity(action.quantity);
      if (quantity === 0) {
        return { ...state, lines: state.lines.filter((line) => line.menuItemId !== action.menuItemId) };
      }
      return {
        ...state,
        lines: state.lines.map((line) => (line.menuItemId === action.menuItemId ? { ...line, quantity } : line)),
      };
    }

    case "setNote": {
      const note = action.note.slice(0, NOTE_MAX_LENGTH);
      return {
        ...state,
        lines: state.lines.map((line) => (line.menuItemId === action.menuItemId ? { ...line, note } : line)),
      };
    }

    case "remove":
      return { ...state, lines: state.lines.filter((line) => line.menuItemId !== action.menuItemId) };

    case "replaceLines":
      return { ...state, lines: action.lines };

    case "clear":
      return { ...state, lines: [] };
  }
}

export interface CartTotals {
  itemCount: number;
  subtotalCents: number;
}

export function getCartTotals(lines: CartLine[]): CartTotals {
  return lines.reduce<CartTotals>(
    (totals, line) => ({
      itemCount: totals.itemCount + line.quantity,
      subtotalCents: totals.subtotalCents + line.unitPriceCents * line.quantity,
    }),
    { itemCount: 0, subtotalCents: 0 },
  );
}
