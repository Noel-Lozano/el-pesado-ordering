// Order totals are always computed here from database prices; anything the
// client sends about price is ignored (ADR-002 decision 5). Integer centavos.

export interface PricedLine {
  menuItemId: number;
  quantity: number;
}

export function computeOrderTotal(lines: PricedLine[], priceCentsById: ReadonlyMap<number, number>): number {
  return lines.reduce((total, line) => {
    const priceCents = priceCentsById.get(line.menuItemId);
    if (priceCents === undefined) {
      throw new Error(`No price for menu item ${line.menuItemId}`);
    }
    return total + priceCents * line.quantity;
  }, 0);
}
