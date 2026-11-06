import { useEffect, useState } from "react";
import { ApiError, getOrder } from "@/lib/api";
import { type Order, TERMINAL_ORDER_STATUSES } from "@/types/order";

// The status page is the only "your order is ready" notification (ADR-002
// decision 9, ADR-003), so it polls GET /orders/:id every 15 seconds.
export const ORDER_POLL_INTERVAL_MS = 15_000;

export type OrderPollState =
  | { kind: "loading" }
  // isStale: the most recent poll failed (e.g. no signal); order is the last one seen.
  | { kind: "loaded"; order: Order; isStale: boolean }
  // The first load failed for a network reason; polling keeps retrying.
  | { kind: "offline" }
  | { kind: "notFound" }
  | { kind: "unauthorized" };

export function useOrderPolling(orderId: string, token: string | null): OrderPollState {
  const [state, setState] = useState<OrderPollState>({ kind: "loading" });

  useEffect(() => {
    if (!token) return;
    const authToken = token;

    let isCancelled = false;
    // True once polling should stop for good (final status, 401, 404).
    let isFinished = false;
    let isInFlight = false;
    let timer: number | undefined;

    function scheduleNext() {
      window.clearTimeout(timer);
      timer = window.setTimeout(poll, ORDER_POLL_INTERVAL_MS);
    }

    async function poll() {
      // A hidden tab stops polling; becoming visible again polls right away.
      if (isCancelled || isFinished || isInFlight || document.visibilityState === "hidden") return;
      isInFlight = true;
      try {
        const order = await getOrder(orderId, authToken);
        if (isCancelled) return;
        setState({ kind: "loaded", order, isStale: false });
        isFinished = TERMINAL_ORDER_STATUSES.includes(order.status);
      } catch (error) {
        if (isCancelled) return;
        const status = error instanceof ApiError ? error.status : 0;
        if (status === 401) {
          setState({ kind: "unauthorized" });
          isFinished = true;
        } else if (status === 404 || status === 400) {
          // 400 = not a valid order id at all.
          setState({ kind: "notFound" });
          isFinished = true;
        } else {
          setState((current) => (current.kind === "loaded" ? { ...current, isStale: true } : { kind: "offline" }));
        }
      } finally {
        isInFlight = false;
      }
      if (!isFinished) scheduleNext();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        window.clearTimeout(timer);
        void poll();
      }
    }

    void poll();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      isCancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [orderId, token]);

  return state;
}
