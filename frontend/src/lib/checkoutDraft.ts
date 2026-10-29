import type { PhoneCountry } from "@/lib/phone";
import type { Pickup } from "@/lib/pickup";

// What the customer entered at /checkout, carried to /checkout/verify.
// sessionStorage (not localStorage): it belongs to this ordering session and
// should not outlive the tab.
//
// The idempotency key is created once per draft and reused until the order
// succeeds, so going back from verify to checkout and resubmitting can't
// produce a second order (see the plan's Deviations section).

export const CHECKOUT_DRAFT_STORAGE_KEY = "elpesado.checkout.v1";

export interface CheckoutDraft {
  name: string;
  country: PhoneCountry;
  // As typed, so the form can be refilled exactly.
  phoneInput: string;
  // E.164, what the API receives.
  phone: string;
  pickup: Pickup;
  idempotencyKey: string;
}

function isPickup(value: unknown): value is Pickup {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.kind === "asap" || (candidate.kind === "scheduled" && typeof candidate.time === "string");
}

export function parseCheckoutDraft(raw: string | null): CheckoutDraft | null {
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const { name, country, phoneInput, phone, pickup, idempotencyKey } = parsed as Record<string, unknown>;
  if (
    typeof name !== "string" ||
    (country !== "MX" && country !== "US") ||
    typeof phoneInput !== "string" ||
    typeof phone !== "string" ||
    !isPickup(pickup) ||
    typeof idempotencyKey !== "string"
  ) {
    return null;
  }
  return { name, country, phoneInput, phone, pickup, idempotencyKey };
}

export function loadCheckoutDraft(): CheckoutDraft | null {
  try {
    return parseCheckoutDraft(window.sessionStorage.getItem(CHECKOUT_DRAFT_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function saveCheckoutDraft(draft: CheckoutDraft): void {
  try {
    window.sessionStorage.setItem(CHECKOUT_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Storage blocked: verify will find no draft and send the customer back here.
  }
}

export function clearCheckoutDraft(): void {
  try {
    window.sessionStorage.removeItem(CHECKOUT_DRAFT_STORAGE_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
