import { strings } from "@/lib/strings";

export const NAME_MAX_LENGTH = 60;

export interface CheckoutFormState {
  name: string;
  // E.164 when the typed number is valid for the chosen country, else null.
  phone: string | null;
  hasValidPickup: boolean;
  // The customer picked a slot that has since passed.
  hasExpiredPickup: boolean;
  unavailableItemCount: number;
  isPhoneRemembered: boolean;
}

export interface CheckoutHint {
  canSubmit: boolean;
  // Shown above the button: why it's disabled, or what happens next.
  message: string;
}

// The checkout button stays disabled until the form is complete (mockup 04).
// The hint names the first missing thing, in the order the form is filled.
export function getCheckoutHint(state: CheckoutFormState): CheckoutHint {
  const trimmedName = state.name.trim();
  const hints = strings.checkout.hints;

  if (state.unavailableItemCount > 0) return { canSubmit: false, message: hints.unavailable };
  if (trimmedName.length === 0) return { canSubmit: false, message: hints.name };
  if (trimmedName.length > NAME_MAX_LENGTH) return { canSubmit: false, message: hints.nameTooLong };
  if (state.phone === null) return { canSubmit: false, message: hints.phone };
  if (state.hasExpiredPickup) return { canSubmit: false, message: hints.pickupExpired };
  if (!state.hasValidPickup) return { canSubmit: false, message: hints.pickup };
  return { canSubmit: true, message: state.isPhoneRemembered ? hints.readyRemembered : hints.ready };
}
