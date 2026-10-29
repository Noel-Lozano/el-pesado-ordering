import { type CartLine, MAX_QUANTITY_PER_LINE, NOTE_MAX_LENGTH } from "@/context/cartReducer";

// The cart is persisted to localStorage so it survives mobile browsers
// killing the tab. Storage can be missing, full, or blocked (private mode),
// so every access is wrapped and falls back to an empty cart.

// Bump the version suffix if CartLine's shape ever changes incompatibly.
export const CART_STORAGE_KEY = "elpesado.cart.v1";

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function toCartLine(value: unknown): CartLine | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const { menuItemId, name, categoryName, unitPriceCents, quantity, note } = candidate;

  if (
    !isPositiveInteger(menuItemId) ||
    typeof name !== "string" ||
    typeof categoryName !== "string" ||
    !isNonNegativeInteger(unitPriceCents) ||
    !isPositiveInteger(quantity) ||
    quantity > MAX_QUANTITY_PER_LINE ||
    typeof note !== "string"
  ) {
    return null;
  }

  return { menuItemId, name, categoryName, unitPriceCents, quantity, note: note.slice(0, NOTE_MAX_LENGTH) };
}

// Anything stored by hand, by an older version, or corrupted is dropped line
// by line rather than throwing away the whole cart.
export function parseStoredCart(raw: string | null): CartLine[] {
  if (raw === null) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }

  const lines: CartLine[] = [];
  const seenIds = new Set<number>();
  for (const entry of parsed) {
    const line = toCartLine(entry);
    if (line && !seenIds.has(line.menuItemId)) {
      seenIds.add(line.menuItemId);
      lines.push(line);
    }
  }
  return lines;
}

export function loadCart(): CartLine[] {
  try {
    return parseStoredCart(window.localStorage.getItem(CART_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function saveCart(lines: CartLine[]): void {
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // Storage blocked or full: the cart still works in memory for this visit.
  }
}
