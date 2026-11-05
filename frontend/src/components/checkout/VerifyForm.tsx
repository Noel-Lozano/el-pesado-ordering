"use client";

import Link from "next/link";
import { type SubmitEvent, useEffect, useState } from "react";
import { OTP_LENGTH, OtpInput } from "@/components/checkout/OtpInput";
import { useAuth } from "@/context/AuthContext";
import { type CartLine, getCartTotals } from "@/context/cartReducer";
import { ApiError, createOrder, sendCode, verifyCode } from "@/lib/api";
import type { CheckoutDraft } from "@/lib/checkoutDraft";
import { formatMXN } from "@/lib/money";
import { buildCreateOrderRequest } from "@/lib/orderRequest";
import { maskPhone } from "@/lib/phone";
import { strings } from "@/lib/strings";
import type { Order } from "@/types/order";

const RESEND_COOLDOWN_SECONDS = 30;

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
  onOrderPlaced: (order: Order) => void;
}

export function VerifyForm({ draft, lines, onOrderPlaced }: VerifyFormProps) {
  const { setToken } = useAuth();
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<Phase>("enterCode");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [failure, setFailure] = useState<OrderFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  // Kept after verification so "retry" can resubmit the order without a new code.
  const [verifiedToken, setVerifiedToken] = useState<string | null>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timeout = window.setTimeout(() => setResendCooldown((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timeout);
  }, [resendCooldown]);

  const isBusy = phase === "verifying" || phase === "placingOrder";
  const { subtotalCents } = getCartTotals(lines);

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
    if (isBusy) return;
    if (code.length !== OTP_LENGTH) {
      setCodeError(strings.verify.errors.codeIncomplete);
      return;
    }

    setCodeError(null);
    setNotice(null);
    setPhase("verifying");
    let token: string;
    try {
      ({ token } = await verifyCode(draft.phone, code));
    } catch (error) {
      setCodeError(verifyErrorMessage(error));
      setPhase("enterCode");
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
    } catch (error) {
      setCodeError(verifyErrorMessage(error));
    }
  }

  const primaryButtonClass =
    "flex min-h-14 items-center justify-center rounded-full bg-red-700 px-6 text-lg font-bold text-white active:bg-red-800 disabled:opacity-50";
  const secondaryLinkClass = "flex min-h-11 items-center justify-center font-medium underline underline-offset-4";

  if (phase === "orderFailed" && failure) {
    const token = verifiedToken;
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className="rounded-xl bg-red-50 p-4 font-medium text-red-900 dark:bg-red-950 dark:text-red-100">
          {failure.message}
        </p>
        {failure.action === "retry" && token && (
          <button type="button" onClick={() => placeOrder(token)} className={primaryButtonClass}>
            {strings.verify.retry}
          </button>
        )}
        {failure.action === "checkout" && (
          <Link href="/checkout" className={primaryButtonClass}>
            {strings.verify.goToCheckout}
          </Link>
        )}
        <Link href="/cart" className={failure.action === "cart" ? primaryButtonClass : secondaryLinkClass}>
          {strings.verify.goToCart}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p>{strings.verify.sentTo(maskPhone(draft.phone))}</p>
        <Link href="/checkout" className="self-start font-medium underline underline-offset-4">
          {strings.verify.changeNumber}
        </Link>
      </div>

      <OtpInput
        id="codigo"
        value={code}
        disabled={isBusy}
        error={codeError}
        onChange={(digits) => {
          setCode(digits);
          setCodeError(null);
        }}
      />

      {notice && (
        <p role="status" className="text-sm text-zinc-700 dark:text-zinc-300">
          {notice}
        </p>
      )}

      <p className="text-zinc-600 dark:text-zinc-400">{strings.verify.totalLine(formatMXN(subtotalCents))}</p>

      <div className="flex flex-col gap-2">
        <button type="submit" disabled={isBusy || code.length !== OTP_LENGTH} className={primaryButtonClass}>
          {phase === "verifying"
            ? strings.verify.verifying
            : phase === "placingOrder"
              ? strings.verify.placingOrder
              : strings.verify.submit}
        </button>
        <button
          type="button"
          onClick={handleResend}
          disabled={isBusy || resendCooldown > 0}
          className={`${secondaryLinkClass} disabled:no-underline disabled:opacity-50`}
        >
          {resendCooldown > 0 ? strings.verify.resendIn(resendCooldown) : strings.verify.resend}
        </button>
      </div>
    </form>
  );
}
