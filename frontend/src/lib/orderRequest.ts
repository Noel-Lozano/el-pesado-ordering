import type { CartLine } from "@/context/cartReducer";
import type { CheckoutDraft } from "@/lib/checkoutDraft";
import type { CreateOrderItem, CreateOrderRequest } from "@/types/order";

// Turns the cart + checkout draft into the POST /orders body. Display prices
// are deliberately left out; the server prices everything itself.
export function buildCreateOrderRequest(lines: CartLine[], draft: CheckoutDraft): CreateOrderRequest {
  const items = lines.map((line): CreateOrderItem => {
    const item: CreateOrderItem = { menuItemId: line.menuItemId, quantity: line.quantity };
    const notes = line.note.trim();
    if (notes) {
      item.notes = notes;
    }
    return item;
  });

  const base = { paymentMethod: "cash" as const, customerName: draft.name, items };
  return draft.pickup.kind === "scheduled"
    ? { ...base, fulfillmentType: "scheduled", requestedTime: draft.pickup.time }
    : { ...base, fulfillmentType: "asap" };
}
