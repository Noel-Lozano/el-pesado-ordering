"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useOrderPolling } from "@/hooks/useOrderPolling";
import { formatMXN } from "@/lib/money";
import { strings } from "@/lib/strings";
import { formatClockTime } from "@/lib/time";
import { type Order, type OrderStatus, TERMINAL_ORDER_STATUSES } from "@/types/order";

const READY_VIBRATION_PATTERN_MS = [200, 100, 200];

// Which of the 4 progress steps (Recibido, Preparando, Listo, Entregado) a
// status reaches. no_show / cancelled show no progress bar.
const STEP_INDEX_BY_STATUS: Partial<Record<OrderStatus, number>> = {
  created: 0,
  confirmed: 0,
  preparing: 1,
  ready: 2,
  picked_up: 3,
};

function ProgressSteps({ status }: { status: OrderStatus }) {
  const currentStep = STEP_INDEX_BY_STATUS[status];
  if (currentStep === undefined) return null;

  return (
    <ol aria-label={strings.order.stepsLabel} className="grid grid-cols-4 gap-1 text-center text-xs font-medium">
      {strings.order.steps.map((label, index) => (
        <li key={label} aria-current={index === currentStep ? "step" : undefined} className="flex flex-col gap-1">
          <span
            className={`h-2 rounded-full ${index <= currentStep ? "bg-red-700" : "bg-zinc-200 dark:bg-zinc-800"}`}
          />
          <span className={index <= currentStep ? "" : "text-zinc-500"}>{label}</span>
        </li>
      ))}
    </ol>
  );
}

function OrderDetails({ order }: { order: Order }) {
  const pickup =
    order.fulfillmentType === "scheduled" && order.requestedClockTime
      ? strings.order.pickupScheduled(formatClockTime(order.requestedClockTime))
      : strings.order.pickupAsap;

  return (
    <>
      <section className="flex flex-col gap-1 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <p>
          <span className="font-semibold">{strings.order.pickupLabel}:</span> {pickup}
        </p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {strings.order.pickupIdentity(order.customerName, order.phoneLast4)}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">{strings.order.itemsTitle}</h2>
        <ul className="flex flex-col gap-2">
          {order.items.map((item) => (
            <li key={item.menuItemId} className="flex justify-between gap-4">
              <div className="min-w-0">
                <p className="font-medium">
                  {item.quantity} × {item.name}
                </p>
                <p className="text-xs uppercase tracking-wide text-zinc-500">{item.categoryName}</p>
                {item.notes && <p className="text-sm text-zinc-600 dark:text-zinc-400">“{item.notes}”</p>}
              </div>
              <p className="shrink-0 tabular-nums">{formatMXN(item.priceAtOrderCents * item.quantity)}</p>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t border-zinc-200 pt-2 text-lg font-bold dark:border-zinc-800">
          <span>{strings.order.total}</span>
          <span className="tabular-nums">{formatMXN(order.totalCents)}</span>
        </div>
        {order.paymentMethod === "cash" && order.paymentStatus === "unpaid" && (
          <p className="text-zinc-600 dark:text-zinc-400">{strings.order.payCash}</p>
        )}
      </section>
    </>
  );
}

export function OrderStatusView({ orderId }: { orderId: string }) {
  const auth = useAuth();
  const pollState = useOrderPolling(orderId, auth.hasLoaded ? auth.token : null);
  const status = pollState.kind === "loaded" ? pollState.order.status : null;
  const { clear: clearAuth } = auth;

  // The server rejected the stored login (expired or invalid): drop it.
  const isUnauthorized = pollState.kind === "unauthorized";
  useEffect(() => {
    if (isUnauthorized) clearAuth();
  }, [isUnauthorized, clearAuth]);

  // Vibrate only when a poll sees the order *become* ready, not when the page
  // opens on an order that's already ready. iOS Safari has no vibrate.
  const previousStatusRef = useRef<OrderStatus | null>(null);
  useEffect(() => {
    const previous = previousStatusRef.current;
    previousStatusRef.current = status;
    if (status === "ready" && previous !== null && previous !== "ready") {
      navigator.vibrate?.(READY_VIBRATION_PATTERN_MS);
    }
  }, [status]);

  // A changed tab title catches the eye even when another tab is in front.
  useEffect(() => {
    if (status !== "ready") return;
    const originalTitle = document.title;
    document.title = strings.order.readyDocumentTitle;
    return () => {
      document.title = originalTitle;
    };
  }, [status]);

  const newOrderLink = (
    <Link href="/" className="flex min-h-11 items-center justify-center font-medium underline underline-offset-4">
      {strings.order.newOrder}
    </Link>
  );

  const loadingMessage = (
    <p className="py-12 text-center text-zinc-600 dark:text-zinc-400">{strings.order.loading}</p>
  );

  if (!auth.hasLoaded) {
    return loadingMessage;
  }

  // No stored login (another device, or cleared storage) or the server
  // rejected it. Sending them to /checkout would be a dead end with an empty cart.
  if (!auth.token || isUnauthorized) {
    return (
      <div className="flex flex-col gap-4 py-6">
        <h2 className="text-xl font-bold">{strings.order.unavailableTitle}</h2>
        <p className="text-zinc-600 dark:text-zinc-400">{strings.order.unavailableBody}</p>
        {newOrderLink}
      </div>
    );
  }

  if (pollState.kind === "loading") {
    return loadingMessage;
  }

  if (pollState.kind === "notFound") {
    return (
      <div className="flex flex-col gap-4 py-6">
        <h2 className="text-xl font-bold">{strings.order.notFoundTitle}</h2>
        <p className="text-zinc-600 dark:text-zinc-400">{strings.order.notFoundBody}</p>
        {newOrderLink}
      </div>
    );
  }

  if (pollState.kind !== "loaded") {
    return (
      <p role="status" className="py-12 text-center text-zinc-600 dark:text-zinc-400">
        {strings.order.offline}
      </p>
    );
  }

  const { order, isStale } = pollState;
  const statusCopy = strings.order.status[order.status];
  const isReady = order.status === "ready";
  const isFinal = TERMINAL_ORDER_STATUSES.includes(order.status);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">{strings.order.orderNumber(order.id)}</p>

      <section
        aria-live="polite"
        className={`flex flex-col gap-1 rounded-xl p-5 ${
          isReady ? "bg-green-700 text-white" : "bg-zinc-100 dark:bg-zinc-900"
        }`}
      >
        <h2 className={isReady ? "text-3xl font-extrabold" : "text-2xl font-bold"}>{statusCopy.title}</h2>
        <p className={isReady ? "text-lg" : "text-zinc-600 dark:text-zinc-400"}>{statusCopy.body}</p>
      </section>

      <ProgressSteps status={order.status} />

      {isStale && (
        <p role="status" className="rounded-lg bg-amber-100 p-3 text-sm text-amber-950 dark:bg-amber-900/40 dark:text-amber-100">
          {strings.order.staleNotice}
        </p>
      )}
      {!isReady && !isFinal && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {strings.order.keepOpenHint} {strings.order.autoUpdate}
        </p>
      )}

      <OrderDetails order={order} />
      {newOrderLink}
    </div>
  );
}
