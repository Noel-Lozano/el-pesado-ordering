import { describe, expect, it } from "vitest";
import { type CheckoutFormState, getCheckoutHint } from "@/lib/checkoutHint";
import { strings } from "@/lib/strings";

const COMPLETE: CheckoutFormState = {
  name: "Ana",
  phone: "+526561234567",
  hasValidPickup: true,
  hasExpiredPickup: false,
  unavailableItemCount: 0,
  isPhoneRemembered: false,
};
const hints = strings.checkout.hints;

describe("getCheckoutHint", () => {
  it("allows submitting a complete form and says a WhatsApp code is coming", () => {
    expect(getCheckoutHint(COMPLETE)).toEqual({ canSubmit: true, message: hints.ready });
  });

  it("says no code is needed for a remembered phone", () => {
    expect(getCheckoutHint({ ...COMPLETE, isPhoneRemembered: true }).message).toBe(hints.readyRemembered);
  });

  it("names the first missing field, in form order", () => {
    expect(getCheckoutHint({ ...COMPLETE, name: "  ", phone: null, hasValidPickup: false })).toEqual({
      canSubmit: false,
      message: hints.name,
    });
    expect(getCheckoutHint({ ...COMPLETE, phone: null, hasValidPickup: false }).message).toBe(hints.phone);
    expect(getCheckoutHint({ ...COMPLETE, hasValidPickup: false }).message).toBe(hints.pickup);
  });

  it("explains an expired pickup slot", () => {
    expect(getCheckoutHint({ ...COMPLETE, hasValidPickup: false, hasExpiredPickup: true }).message).toBe(
      hints.pickupExpired,
    );
  });

  it("rejects names over 60 characters", () => {
    expect(getCheckoutHint({ ...COMPLETE, name: "a".repeat(61) }).canSubmit).toBe(false);
  });

  it("blocks while unavailable items are in the cart", () => {
    expect(getCheckoutHint({ ...COMPLETE, unavailableItemCount: 1 })).toEqual({
      canSubmit: false,
      message: hints.unavailable,
    });
  });
});
