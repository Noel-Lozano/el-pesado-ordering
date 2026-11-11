"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type SubmitEvent, useState } from "react";
import { PaymentOptions } from "@/components/checkout/PaymentOptions";
import { PhoneInput } from "@/components/checkout/PhoneInput";
import { PickupTimePicker } from "@/components/checkout/PickupTimePicker";
import { BottomActionBar } from "@/components/ui/BottomActionBar";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";
import { useAuth } from "@/context/AuthContext";
import { type CartLine, getCartTotals } from "@/context/cartReducer";
import { useNow } from "@/hooks/useNow";
import { ApiError, sendCode } from "@/lib/api";
import { loadCheckoutDraft, saveCheckoutDraft } from "@/lib/checkoutDraft";
import { getCheckoutHint, NAME_MAX_LENGTH } from "@/lib/checkoutHint";
import { isTokenUsable } from "@/lib/jwt";
import { formatMXN } from "@/lib/money";
import { describeNextOpening } from "@/lib/nextOpening";
import { normalizePhone, type PhoneCountry, splitE164 } from "@/lib/phone";
import {
  getNextOpening,
  getScheduledSlots,
  isAsapAvailable,
  isShopOpen,
  latestAvailableFrom,
  type Pickup,
} from "@/lib/pickup";
import { strings } from "@/lib/strings";
import { createUuid } from "@/lib/uuid";
import type { MenuResponse } from "@/types/menu";

const ASAP: Pickup = { kind: "asap" };
const HINT_ID = "checkout-pista";

function sendCodeErrorMessage(error: unknown): string {
  return error instanceof ApiError && error.code === "network_error"
    ? strings.checkout.errors.network
    : strings.checkout.errors.sendFailed;
}

interface CheckoutFormProps {
  menu: MenuResponse;
  lines: CartLine[];
}

// Screen 04 · Confirmar pedido: name, phone, pickup time and payment on one
// screen. The button stays disabled until everything is valid, with a hint
// saying what's missing.
export function CheckoutForm({ menu, lines }: CheckoutFormProps) {
  const router = useRouter();
  const now = useNow();
  const auth = useAuth();

  // Mounted only on the client (see CheckoutView), so reading sessionStorage
  // in the initial state is safe and refills the form after "back" from verify.
  // Without a draft, a returning customer's verified phone is prefilled.
  const [savedDraft] = useState(loadCheckoutDraft);
  const [rememberedPhone] = useState(() => (auth.phone ? splitE164(auth.phone) : null));
  const [name, setName] = useState(savedDraft?.name ?? "");
  const [country, setCountry] = useState<PhoneCountry>(savedDraft?.country ?? rememberedPhone?.country ?? "MX");
  const [phoneInput, setPhoneInput] = useState(savedDraft?.phoneInput ?? rememberedPhone?.nationalNumber ?? "");
  const [selectedPickup, setSelectedPickup] = useState<Pickup | null>(savedDraft?.pickup ?? null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (now === null) {
    return (
      <p role="status" className="py-12 text-center font-bold text-muted">
        {strings.checkout.loading}
      </p>
    );
  }

  if (!isShopOpen(now, menu.shop)) {
    const nextOpening = getNextOpening(now, menu.shop);
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6">
        <Notice tone="warning">
          <p className="text-base font-black">{strings.checkout.closedTitle}</p>
          <p className="font-semibold">{strings.checkout.closedBody}</p>
          {nextOpening && <p>{describeNextOpening(nextOpening)}</p>}
        </Notice>
        <ButtonLink href="/cart" variant="secondary">
          {strings.checkout.backToCart}
        </ButtonLink>
      </div>
    );
  }

  const availableFromById = new Map(
    menu.categories.flatMap((category) => category.items).map((item) => [item.id, item.availableFrom]),
  );
  const unavailableLines = lines.filter((line) => !availableFromById.has(line.menuItemId));
  const itemsAvailableFrom = latestAvailableFrom(lines.map((line) => availableFromById.get(line.menuItemId) ?? null));
  const asapAvailable = isAsapAvailable(now, menu.shop, itemsAvailableFrom);
  const slots = getScheduledSlots(now, menu.shop, itemsAvailableFrom);

  // Pickup is derived each render because time moves: a slot chosen earlier
  // (or saved in the draft) may have passed. ASAP is the default when allowed.
  const requestedPickup = selectedPickup ?? (asapAvailable ? ASAP : null);
  const isRequestedPickupValid =
    requestedPickup !== null &&
    (requestedPickup.kind === "asap" ? asapAvailable : slots.some((slot) => slot.time === requestedPickup.time));
  const pickup = isRequestedPickupValid ? requestedPickup : null;

  const phone = normalizePhone(phoneInput, country);
  // A returning customer whose login for this same phone is still good
  // skips the WhatsApp code (decided 2026-11-04). If the server rejects the
  // token anyway, the 401 handler brings them back here to get a code.
  const isPhoneRemembered = phone !== null && auth.token !== null && auth.phone === phone && isTokenUsable(auth.token, now);
  const hint = getCheckoutHint({
    name,
    phone,
    hasValidPickup: pickup !== null,
    hasExpiredPickup: selectedPickup !== null && pickup === null,
    unavailableItemCount: unavailableLines.length,
    isPhoneRemembered,
  });
  const { itemCount, subtotalCents } = getCartTotals(lines);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hint.canSubmit || phone === null || pickup === null || isSubmitting) return;

    setIsSubmitting(true);
    setFormError(null);
    try {
      if (!isPhoneRemembered) {
        await sendCode(phone);
      }
      saveCheckoutDraft({
        name: name.trim(),
        country,
        phoneInput,
        phone,
        pickup,
        // One key per checkout, reused on retries (ADR-002 #7).
        idempotencyKey: savedDraft?.idempotencyKey ?? createUuid(),
      });
      // Stays "submitting" while navigating so the button can't be tapped twice.
      router.push("/checkout/verify");
    } catch (error) {
      setFormError(sendCodeErrorMessage(error));
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-3.5 px-4 pb-6 pt-4">
        {unavailableLines.length > 0 && (
          <Notice tone="warning">
            <p className="font-black">{strings.checkout.unavailableTitle}</p>
            <ul className="list-disc pl-5">
              {unavailableLines.map((line) => (
                <li key={line.menuItemId}>{strings.cart.itemLabel(line.name, line.categoryName)}</li>
              ))}
            </ul>
            <Link href="/cart" className="mt-1 inline-flex min-h-11 items-center underline underline-offset-4">
              {strings.checkout.backToCart}
            </Link>
          </Notice>
        )}

        <Card>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-3 text-base font-black">{strings.checkout.detailsLegend}</legend>
            <label className="flex flex-col gap-1.5 text-sm font-extrabold">
              {strings.checkout.nameLabel}
              <input
                type="text"
                autoComplete="name"
                value={name}
                maxLength={NAME_MAX_LENGTH}
                onChange={(event) => setName(event.target.value)}
                placeholder={strings.checkout.namePlaceholder}
                className="h-[46px] rounded-sm border-2 border-navy bg-paper px-3 font-normal text-navy placeholder:text-muted"
              />
            </label>
            <PhoneInput
              id="celular"
              country={country}
              value={phoneInput}
              onCountryChange={setCountry}
              onChange={setPhoneInput}
            />
          </fieldset>
        </Card>

        <PickupTimePicker
          asapAvailable={asapAvailable}
          slots={slots}
          itemsAvailableFrom={itemsAvailableFrom}
          value={pickup}
          onChange={setSelectedPickup}
        />

        <PaymentOptions />

        <div className="flex items-center justify-between gap-3 rounded border-2 border-navy bg-yellow px-3.5 py-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-extrabold">{strings.checkout.summaryLine(itemCount)}</span>
            <span className="font-display text-[22px] tabular-nums">
              {strings.cart.totalWithCurrency(formatMXN(subtotalCents))}
            </span>
          </div>
          <Link
            href="/cart"
            aria-label={strings.checkout.seeDetailLabel}
            className="flex min-h-11 items-center text-sm font-black underline underline-offset-4"
          >
            {strings.checkout.seeDetail}
          </Link>
        </div>
      </div>

      <BottomActionBar>
        {formError ? (
          <p role="alert" className="text-center text-[13px] font-extrabold text-red">
            {formError}
          </p>
        ) : (
          <p id={HINT_ID} aria-live="polite" className="text-center text-[13px] font-bold text-muted">
            {hint.message}
          </p>
        )}
        <Button type="submit" disabled={!hint.canSubmit || isSubmitting} aria-describedby={HINT_ID}>
          {isSubmitting
            ? strings.checkout.submitting
            : isPhoneRemembered
              ? strings.checkout.submitRemembered
              : strings.checkout.submit}
        </Button>
      </BottomActionBar>
    </form>
  );
}
