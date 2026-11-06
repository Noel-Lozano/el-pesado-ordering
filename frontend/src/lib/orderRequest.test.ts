import { describe, expect, it } from "vitest";
import type { CartLine } from "@/context/cartReducer";
import type { CheckoutDraft } from "@/lib/checkoutDraft";
import { buildCreateOrderRequest } from "@/lib/orderRequest";

const lines: CartLine[] = [
  { menuItemId: 1, name: "Frijoles con queso", categoryName: "Burritos", unitPriceCents: 3000, quantity: 2, note: "  sin cebolla " },
  { menuItemId: 7, name: "Agua", categoryName: "Extras", unitPriceCents: 1000, quantity: 1, note: "   " },
];

const draft: CheckoutDraft = {
  name: "Ana",
  country: "MX",
  phoneInput: "656 123 4567",
  phone: "+526561234567",
  pickup: { kind: "asap" },
  idempotencyKey: "0b6d1b5e-6f1f-4f8e-9a37-5b1d3c2e7f10",
};

describe("buildCreateOrderRequest", () => {
  it("builds an ASAP cash order without prices", () => {
    expect(buildCreateOrderRequest(lines, draft)).toEqual({
      fulfillmentType: "asap",
      paymentMethod: "cash",
      customerName: "Ana",
      items: [
        { menuItemId: 1, quantity: 2, notes: "sin cebolla" },
        { menuItemId: 7, quantity: 1 },
      ],
    });
  });

  it("sends requestedTime only for scheduled pickup", () => {
    const time = "2026-10-28T17:30:00.000Z";
    const request = buildCreateOrderRequest(lines, { ...draft, pickup: { kind: "scheduled", time } });
    expect(request.fulfillmentType).toBe("scheduled");
    expect(request.requestedTime).toBe(time);
    expect("requestedTime" in buildCreateOrderRequest(lines, draft)).toBe(false);
  });
});
