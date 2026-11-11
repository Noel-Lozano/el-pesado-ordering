"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { hasTrackerProgress, StatusTracker } from "@/components/order/StatusTracker";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CheckIcon, PinIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/Notice";
import { TabBar } from "@/components/ui/TabBar";
import { TopBar } from "@/components/ui/TopBar";
import { useAuth } from "@/context/AuthContext";
import { useOrderPolling } from "@/hooks/useOrderPolling";
import { formatMXN } from "@/lib/money";
import { strings } from "@/lib/strings";
import { formatClockTime } from "@/lib/time";
import { type Order, type OrderStatus, TERMINAL_ORDER_STATUSES } from "@/types/order";

const READY_VIBRATION_PATTERN_MS = [200, 100, 200];

function pickupDescription(order: Order): string {
  return order.fulfillmentType === "scheduled" && order.requestedClockTime
    ? strings.order.pickupScheduled(formatClockTime(order.requestedClockTime))
    : strings.order.pickupAsap;
}

// Navy hero from mockup 06: check tile, outlined title, a status line and the
// order number (orders.id, ADR-004 resolved questions).
function OrderHero({ order, isStale }: { order: Order; isStale: boolean }) {
  const isFinal = TERMINAL_ORDER_STATUSES.includes(order.status);
  const subtitle = isFinal || order.status === "ready" ? strings.order.status[order.status].body : strings.order.keepOpenHint;

  return (
    <section className="border-b-[5px] border-orange bg-navy px-4 pb-[26px] pt-[calc(env(safe-area-inset-top)+40px)]">
      <div className="mx-auto flex max-w-xl flex-col items-start gap-3.5">
        <span
          aria-hidden
          className="flex h-16 w-16 items-center justify-center rounded border-[3px] border-red bg-yellow text-navy"
        >
          <CheckIcon size={34} />
        </span>
        <h1 className="title-outline font-display text-4xl font-normal leading-[1.05]">
          {strings.order.heroTitle[order.status]}
        </h1>
        <p className="text-base font-bold leading-normal text-white">{subtitle}</p>
        <span className="rounded-sm bg-white px-2.5 py-1 text-sm font-black text-navy">
          {strings.order.orderNumber(order.id)}
        </span>
        {isStale && <p className="text-sm font-bold text-yellow">{strings.order.staleNotice}</p>}
      </div>
    </section>
  );
}

function OrderSummaryCard({ order }: { order: Order }) {
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <Card className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3">
        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-yellow">
          <PinIcon />
        </span>
        <div className="flex flex-1 flex-col gap-0.5">
          <h2 className="text-base font-black">{strings.order.pickupTitle}</h2>
          <p className="text-sm font-bold text-muted">{pickupDescription(order)}</p>
        </div>
      </div>
      <p className="text-sm font-semibold">{strings.order.pickupIdentity(order.customerName, order.phoneLast4)}</p>

      <div className="flex items-baseline justify-between gap-3 border-t-[1.5px] border-dashed border-line pt-2.5">
        <span className="text-sm font-extrabold text-muted">{strings.order.paymentSummary(itemCount)}</span>
        <span className="font-display text-[22px] tabular-nums">
          {strings.cart.totalWithCurrency(formatMXN(order.totalCents))}
        </span>
      </div>

      <details>
        <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-black underline underline-offset-4">
          {strings.order.seeDetail}
        </summary>
        <ul className="flex flex-col divide-y-[1.5px] divide-line">
          {order.items.map((item) => (
            <li key={item.menuItemId} className="flex justify-between gap-4 py-2">
              <div className="min-w-0">
                <p className="font-black">
                  {item.quantity} × {item.name}
                </p>
                <p className="text-[13px] font-semibold text-muted">
                  {[strings.cart.variantByCategory[item.categoryName] ?? item.categoryName, item.notes]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <p className="shrink-0 font-black tabular-nums">{formatMXN(item.priceAtOrderCents * item.quantity)}</p>
            </li>
          ))}
        </ul>
      </details>
    </Card>
  );
}

// Loading / not found / unavailable: plain layout with the tab bar.
function MessageLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <TopBar title={strings.order.pageTitle} />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-8">{children}</main>
      <TabBar activeTab="orders" />
    </>
  );
}

// Screen 06 · Pedido recibido, also the live status page: polls every 15 s
// (ADR-002 #9), which is the only "ready" notification the customer gets.
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

  const backToMenu = (
    <ButtonLink href="/" variant="secondary">
      {strings.order.backToMenu}
    </ButtonLink>
  );

  if (!auth.hasLoaded || pollState.kind === "loading") {
    return (
      <MessageLayout>
        <p role="status" className="py-8 text-center font-bold text-muted">
          {strings.order.loading}
        </p>
      </MessageLayout>
    );
  }

  // No stored login (another device, or cleared storage) or the server
  // rejected it. Sending them to /checkout would be a dead end with an empty cart.
  if (!auth.token || isUnauthorized) {
    return (
      <MessageLayout>
        <h2 className="font-display text-2xl font-normal">{strings.order.unavailableTitle}</h2>
        <p className="font-semibold text-muted">{strings.order.unavailableBody}</p>
        {backToMenu}
      </MessageLayout>
    );
  }

  if (pollState.kind === "notFound") {
    return (
      <MessageLayout>
        <h2 className="font-display text-2xl font-normal">{strings.order.notFoundTitle}</h2>
        <p className="font-semibold text-muted">{strings.order.notFoundBody}</p>
        {backToMenu}
      </MessageLayout>
    );
  }

  if (pollState.kind !== "loaded") {
    return (
      <MessageLayout>
        <p role="status" className="py-8 text-center font-bold">
          {strings.order.offline}
        </p>
      </MessageLayout>
    );
  }

  const { order, isStale } = pollState;

  return (
    <>
      <OrderHero order={order} isStale={isStale} />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-3 px-4 pb-6 pt-4">
        {/* Announces each status change once, politely. */}
        <p aria-live="polite" className="sr-only">
          {strings.order.statusAnnouncement(strings.order.status[order.status].title)}
        </p>
        {hasTrackerProgress(order.status) ? (
          <StatusTracker status={order.status} />
        ) : (
          <Notice tone="warning">
            <p className="font-black">{strings.order.status[order.status].title}</p>
            <p>{strings.order.status[order.status].body}</p>
          </Notice>
        )}
        <OrderSummaryCard order={order} />
        <ButtonLink href="/">{strings.order.backToMenu}</ButtonLink>
      </main>
      <TabBar activeTab="orders" />
    </>
  );
}
