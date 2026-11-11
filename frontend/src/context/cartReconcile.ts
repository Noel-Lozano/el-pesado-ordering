import type { CartLine } from "@/context/cartReducer";
import { listMenuItems } from "@/lib/menuGrouping";
import type { MenuCategory } from "@/types/menu";

export interface ReconcileResult {
  lines: CartLine[];
  // Names of lines dropped because their item is no longer on the menu.
  droppedNames: string[];
  // False when nothing changed, so callers can skip a state update.
  hasChanged: boolean;
}

// Re-checks a saved cart against the latest menu (ADR-004 §2): drops lines
// whose item is gone (GET /menu hides unavailable and unpriced items) and
// refreshes names and prices. Display only; the server prices the order.
export function reconcileCart(lines: CartLine[], categories: MenuCategory[]): ReconcileResult {
  const menuById = new Map(listMenuItems(categories).map((entry) => [entry.item.id, entry]));
  const kept: CartLine[] = [];
  const droppedNames: string[] = [];
  let hasChanged = false;

  for (const line of lines) {
    const entry = menuById.get(line.menuItemId);
    if (!entry) {
      droppedNames.push(line.name);
      hasChanged = true;
      continue;
    }

    const refreshed: CartLine = {
      ...line,
      name: entry.item.name,
      categoryName: entry.categoryName,
      unitPriceCents: entry.item.priceCents,
    };
    if (
      refreshed.name !== line.name ||
      refreshed.categoryName !== line.categoryName ||
      refreshed.unitPriceCents !== line.unitPriceCents
    ) {
      hasChanged = true;
    }
    kept.push(refreshed);
  }

  return { lines: kept, droppedNames, hasChanged };
}
