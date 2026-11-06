"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type SubmitEvent, useState } from "react";
import { PhoneInput } from "@/components/checkout/PhoneInput";
import { PickupTimePicker } from "@/components/checkout/PickupTimePicker";
import { useAuth } from "@/context/AuthContext";
import { type CartLine, getCartTotals } from "@/context/cartReducer";
import { useNow } from "@/hooks/useNow";
import { ApiError, sendCode } from "@/lib/api";
import { loadCheckoutDraft, saveCheckoutDraft } from "@/lib/checkoutDraft";
import { isTokenUsable } from "@/lib/jwt";
import { formatMXN } from "@/lib/money";
import { normalizePhone, type PhoneCountry, splitE164 } from "@/lib/phone";
import {
  getNextOpening,
  getScheduledSlots,
  isAsapAvailable,
  isShopOpen,
  latestAvailableFrom,
  type NextOpening,
  type Pickup,
} from "@/lib/pickup";
import { strings } from "@/lib/strings";
import { formatClockTime } from "@/lib/time";
import { createUuid } from "@/lib/uuid";
import type { MenuResponse } from "@/types/menu";

const NAME_MAX_LENGTH = 60;
const ASAP: Pickup = { kind: "asap" };

interface FormErrors {
  name?: string;
  phone?: string;
  pickup?: string;
  form?: string;
}

function describeNextOpening(next: NextOpening): string {
  const when =
    next.daysFromToday === 0
      ? strings.checkout.today
      : next.daysFromToday === 1
        ? strings.checkout.tomorrow
        : (strings.checkout.dayNames[next.dayOfWeek] ?? "");
  return strings.checkout.nextOpening(when, formatClockTime(next.open));
}

function sendCodeErrorMessage(error: unknown): string {
  return error instanceof ApiError && error.code === "network_error"
    ? strings.checkout.errors.network
    : strings.checkout.errors.sendFailed;
}

interface CheckoutFormProps {
  menu: MenuResponse;
  lines: CartLine[];
}

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
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (now === null) {
    return <p className="py-12 text-center text-zinc-600 dark:text-zinc-400">{strings.checkout.loading}</p>;
  }

  const backToCartLink = (
    <Link href="/cart" className="flex min-h-11 items-center justify-center font-medium underline underline-offset-4">
      {strings.checkout.backToCart}
    </Link>
  );

  if (!isShopOpen(now, menu.shop)) {
    const nextOpening = getNextOpening(now, menu.shop);
    return (
      <div className="flex flex-col gap-4">
        <section className="rounded-xl bg-amber-100 p-4 text-amber-950 dark:bg-amber-900/40 dark:text-amber-100">
          <h2 className="text-xl font-bold">{strings.checkout.closedTitle}</h2>
          <p className="mt-1">{strings.checkout.closedBody}</p>
          {nextOpening && <p className="mt-1 font-semibold">{describeNextOpening(nextOpening)}</p>}
        </section>
        {backToCartLink}
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
  const pickupError =
    errors.pickup ?? (selectedPickup !== null && pickup === null ? strings.checkout.errors.pickupExpired : null);

  const { itemCount, subtotalCents } = getCartTotals(lines);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();
    const phone = normalizePhone(phoneInput, country);
    const nextErrors: FormErrors = {};
    if (trimmedName.length === 0) {
      nextErrors.name = strings.checkout.errors.nameRequired;
    } else if (trimmedName.length > NAME_MAX_LENGTH) {
      nextErrors.name = strings.checkout.errors.nameTooLong;
    }
    if (phone === null) {
      nextErrors.phone = strings.checkout.errors.phoneInvalid[country];
    }
    if (pickup === null) {
      nextErrors.pickup =
        selectedPickup === null ? strings.checkout.errors.pickupRequired : strings.checkout.errors.pickupExpired;
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || phone === null || pickup === null || unavailableLines.length > 0) {
      return;
    }

    // A returning customer whose login for this same phone is still good
    // skips the WhatsApp code (decided 2026-11-04). If the server rejects the
    // token anyway, the 401 handler brings them back here to get a code.
    const canSkipCode = auth.token !== null && auth.phone === phone && isTokenUsable(auth.token, new Date());

    setIsSubmitting(true);
    try {
      if (!canSkipCode) {
        await sendCode(phone);
      }
      saveCheckoutDraft({
        name: trimmedName,
        country,
        phoneInput,
        phone,
        pickup,
        idempotencyKey: savedDraft?.idempotencyKey ?? createUuid(),
      });
      // Stays "submitting" while navigating so the button can't be tapped twice.
      router.push("/checkout/verify");
    } catch (error) {
      setErrors({ form: sendCodeErrorMessage(error) });
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <p className="text-zinc-600 dark:text-zinc-400">
        {strings.checkout.orderSummary(itemCount, formatMXN(subtotalCents))}
      </p>

      {unavailableLines.length > 0 && (
        <section role="alert" className="rounded-xl bg-red-50 p-4 text-red-900 dark:bg-red-950 dark:text-red-100">
          <h2 className="font-bold">{strings.checkout.unavailableTitle}</h2>
          <p className="mt-1">{strings.checkout.unavailableBody}</p>
          <ul className="mt-1 list-disc pl-5">
            {unavailableLines.map((line) => (
              <li key={line.menuItemId}>{strings.cart.itemLabel(line.name, line.categoryName)}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="nombre" className="font-semibold">
          {strings.checkout.nameLabel}
        </label>
        <input
          id="nombre"
          type="text"
          autoComplete="name"
          value={name}
          maxLength={NAME_MAX_LENGTH}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={errors.name !== undefined}
          aria-describedby={errors.name ? "nombre-ayuda nombre-error" : "nombre-ayuda"}
          className="min-h-12 rounded-lg border border-zinc-300 bg-transparent px-3 text-base dark:border-zinc-700"
        />
        <p id="nombre-ayuda" className="text-sm text-zinc-600 dark:text-zinc-400">
          {strings.checkout.nameHint}
        </p>
        {errors.name && (
          <p id="nombre-error" className="text-sm font-medium text-red-700 dark:text-red-400">
            {errors.name}
          </p>
        )}
      </div>

      <PhoneInput
        id="celular"
        country={country}
        value={phoneInput}
        error={errors.phone ?? null}
        onCountryChange={setCountry}
        onChange={setPhoneInput}
      />

      <PickupTimePicker
        asapAvailable={asapAvailable}
        slots={slots}
        itemsAvailableFrom={itemsAvailableFrom}
        value={pickup}
        error={pickupError}
        onChange={(next) => {
          setSelectedPickup(next);
          setErrors((current) => ({ ...current, pickup: undefined }));
        }}
      />

      {errors.form && (
        <p role="alert" className="font-medium text-red-700 dark:text-red-400">
          {errors.form}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <button
          type="submit"
          disabled={isSubmitting || unavailableLines.length > 0}
          className="flex min-h-14 items-center justify-center rounded-full bg-red-700 px-6 text-lg font-bold text-white active:bg-red-800 disabled:opacity-50"
        >
          {isSubmitting ? strings.checkout.submitting : strings.checkout.submit}
        </button>
        {backToCartLink}
      </div>
    </form>
  );
}
