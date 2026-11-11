"use client";

import Link from "next/link";
import { type SubmitEvent, useEffect, useRef, useState } from "react";
import { OTP_LENGTH, OtpInput } from "@/components/checkout/OtpInput";
import { BottomActionBar } from "@/components/ui/BottomActionBar";
import { Button, ButtonLink } from "@/components/ui/Button";
import { InfoIcon, PhoneIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/Notice";
import { useAuth } from "@/context/AuthContext";
import { type CartLine, getCartTotals } from "@/context/cartReducer";
import { ApiError, createOrder, sendCode, verifyCode } from "@/lib/api";
import type { CheckoutDraft } from "@/lib/checkoutDraft";
import { formatMXN } from "@/lib/money";
import { buildCreateOrderRequest } from "@/lib/orderRequest";
import { maskPhone } from "@/lib/phone";
import { strings } from "@/lib/strings";
import type { Order } from "@/types/order";

const RESEND_COOLDOWN_SECONDS = 60;
const CODE_MESSAGE_ID = "codigo-mensaje";

type Phase = "enterCode" | "verifying" | "placingOrder" | "orderFailed";
// What the customer can do about a failed order.
type RecoveryAction = "retry" | "cart" | "checkout";

interface OrderFailure {
  message: string;
  action: RecoveryAction;
}

function isNetworkError(error: unknown): boolean {
  return error instanceof ApiError && error.code === "network_error";
}

function verifyErrorMessage(error: unknown): string {
  if (isNetworkError(error)) return strings.verify.errors.network;
  if (!(error instanceof ApiError)) return strings.verify.errors.verifyFailed;
  switch (error.code) {
    case "invalid_code":
      return strings.verify.errors.invalidCode;
    case "too_many_attempts":
      return strings.verify.errors.tooManyAttempts;
    case "too_many_requests":
      return strings.verify.errors.tooManyRequests;
    default:
      return strings.verify.errors.verifyFailed;
  }
}

function orderFailure(error: unknown): OrderFailure {
  if (isNetworkError(error)) return { message: strings.verify.errors.network, action: "retry" };
  if (!(error instanceof ApiError)) return { message: strings.verify.errors.orderFailed, action: "retry" };
  switch (error.code) {
    case "menu_item_unavailable":
      return { message: strings.verify.errors.itemUnavailable, action: "cart" };
    case "shop_closed":
      return { message: strings.verify.errors.shopClosed, action: "cart" };
    case "invalid_pickup_time":
    case "item_not_available_yet":
      return { message: strings.verify.errors.pickupInvalid, action: "checkout" };
    default:
      return { message: strings.verify.errors.orderFailed, action: "retry" };
  }
}

interface VerifyFormProps {
  draft: CheckoutDraft;
  lines: CartLine[];
  // A still-valid login for draft.phone: the customer skips the code.
  rememberedToken: string | null;
  onOrderPlaced: (order: Order) => void;
}

// Screen 05 · Código de WhatsApp: verify the code, then create the order with
// the checkout's idempotency key and hand off to the order page.
export function VerifyForm({ draft, lines, rememberedToken, onOrderPlaced }: VerifyFormProps) {
  const { setToken } = useAuth();
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<Phase>("enterCode");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [failure, setFailure] = useState<OrderFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  // Kept after verification so "retry" can resubmit the order without a new code.
  const [verifiedToken, setVerifiedToken] = useState<string | null>(rememberedToken);
  // Decided once on mount, so saving a fresh token mid-flow doesn't switch views.
  const [skipsCode] = useState(rememberedToken !== null);
  const firstDigitRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timeout = window.setTimeout(() => setResendCooldown((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timeout);
  }, [resendCooldown]);

  const isBusy = phase === "verifying" || phase === "placingOrder";
  const { subtotalCents } = getCartTotals(lines);
  const maskedPhone = maskPhone(draft.phone);

  async function placeOrder(token: string) {
    setPhase("placingOrder");
    setFailure(null);
    try {
      // Same idempotency key on every attempt: a retry after a lost response
      // returns the order that was already created.
      const order = await createOrder(buildCreateOrderRequest(lines, draft), token, draft.idempotencyKey);
      onOrderPlaced(order);
    } catch (error) {
      setFailure(orderFailure(error));
      setPhase("orderFailed");
    }
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isBusy || code.length !== OTP_LENGTH) return;

    setCodeError(null);
    setNotice(null);
    setPhase("verifying");
    let token: string;
    try {
      ({ token } = await verifyCode(draft.phone, code));
    } catch (error) {
      setCodeError(verifyErrorMessage(error));
      setPhase("enterCode");
      // Start over from the first box so a new attempt is quick.
      setCode("");
      firstDigitRef.current?.focus();
      return;
    }
    setToken(token, draft.phone);
    setVerifiedToken(token);
    await placeOrder(token);
  }

  async function handleResend() {
    setCodeError(null);
    setNotice(null);
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    try {
      await sendCode(draft.phone);
      setCode("");
      setNotice(strings.verify.resent);
      firstDigitRef.current?.focus();
    } catch (error) {
      setCodeError(verifyErrorMessage(error));
    }
  }

  const submitLabel =
    phase === "verifying"
      ? strings.verify.verifying
      : phase === "placingOrder"
        ? strings.verify.placingOrder
        : strings.verify.submit;

  if (phase === "orderFailed" && failure) {
    const token = verifiedToken;
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-3 px-4 py-8">
        <Notice tone="warning">
          <p role="alert">{failure.message}</p>
        </Notice>
        {failure.action === "retry" && token && (
          <Button onClick={() => placeOrder(token)}>{strings.verify.retry}</Button>
        )}
        {failure.action === "checkout" && <ButtonLink href="/checkout">{strings.verify.goToCheckout}</ButtonLink>}
        <ButtonLink href="/cart" variant={failure.action === "cart" ? "primary" : "secondary"}>
          {strings.verify.goToCart}
        </ButtonLink>
      </div>
    );
  }

  const header = (
    <span
      aria-hidden
      className="flex h-[72px] w-[72px] items-center justify-center rounded border-2 border-navy bg-yellow shadow-hard"
    >
      <PhoneIcon />
    </span>
  );
  const totalLine = (
    <p className="text-sm font-bold text-muted">{strings.verify.totalLine(formatMXN(subtotalCents))}</p>
  );

  if (skipsCode && verifiedToken) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 pb-6 pt-8">
          {header}
          <div className="flex flex-col gap-2">
            <h2 className="font-display text-[32px] font-normal leading-tight">
              {strings.verify.alreadyVerifiedHeading}
            </h2>
            <p className="text-base leading-normal text-muted">{strings.verify.alreadyVerified(maskedPhone)}</p>
          </div>
          <Link href="/checkout" className="flex min-h-11 items-center self-start text-sm font-black underline underline-offset-4">
            {strings.verify.changeNumber}
          </Link>
          {totalLine}
        </div>
        <BottomActionBar>
          <Button onClick={() => placeOrder(verifiedToken)} disabled={isBusy}>
            {submitLabel}
          </Button>
        </BottomActionBar>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-[22px] px-4 pb-6 pt-8">
        {header}
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-[32px] font-normal leading-tight">{strings.verify.heading}</h2>
          <p className="text-base leading-normal text-muted">
            {strings.verify.sentToBefore}
            <strong className="whitespace-nowrap text-navy">{maskedPhone}</strong>
            {strings.verify.sentToAfter}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <OtpInput
            value={code}
            onChange={(digits) => {
              setCode(digits);
              setCodeError(null);
            }}
            disabled={isBusy}
            isInvalid={codeError !== null}
            describedById={codeError || notice ? CODE_MESSAGE_ID : undefined}
            firstInputRef={firstDigitRef}
          />
          {codeError && (
            <p id={CODE_MESSAGE_ID} role="alert" className="text-sm font-extrabold text-red">
              {codeError}
            </p>
          )}
          {!codeError && notice && (
            <p id={CODE_MESSAGE_ID} role="status" className="text-sm font-bold">
              {notice}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          {resendCooldown > 0 ? (
            <p className="text-sm font-bold text-muted" aria-live="off">
              {strings.verify.resendIn(resendCooldown)}
            </p>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              disabled={isBusy}
              className="flex min-h-11 items-center text-sm font-black underline underline-offset-4 disabled:opacity-50"
            >
              {strings.verify.resend}
            </button>
          )}
          <Link href="/checkout" className="flex min-h-11 items-center text-sm font-black underline underline-offset-4">
            {strings.verify.changeNumber}
          </Link>
        </div>

        <div className="flex gap-2.5 rounded border-[1.5px] border-dashed border-navy bg-paper px-3.5 py-3">
          <InfoIcon className="shrink-0" />
          <p className="text-sm font-semibold leading-snug">{strings.verify.privacyNote}</p>
        </div>
        {totalLine}
      </div>

      <BottomActionBar>
        <Button type="submit" disabled={isBusy || code.length !== OTP_LENGTH}>
          {submitLabel}
        </Button>
      </BottomActionBar>
    </form>
  );
}
