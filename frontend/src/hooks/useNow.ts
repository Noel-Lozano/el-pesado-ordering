import { useSyncExternalStore } from "react";

// Pickup slots depend on the current time, so the checkout re-renders as the
// clock moves. Ticks are coarse on purpose: slots are 15 minutes apart.
const TICK_MS = 30_000;

function subscribe(onTick: () => void): () => void {
  const interval = window.setInterval(onTick, TICK_MS);
  return () => window.clearInterval(interval);
}

// Rounded to the tick so the snapshot is stable between ticks, as
// useSyncExternalStore requires.
let cachedSnapshot: Date | null = null;
function getSnapshot(): Date {
  const tickStart = Math.floor(Date.now() / TICK_MS) * TICK_MS;
  if (cachedSnapshot?.getTime() !== tickStart) {
    cachedSnapshot = new Date(tickStart);
  }
  return cachedSnapshot;
}

// The server has no meaningful "now" for the customer; render nothing time-based there.
function getServerSnapshot(): null {
  return null;
}

export function useNow(): Date | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
