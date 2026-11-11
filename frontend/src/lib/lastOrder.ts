// The most recent order placed on this device, so the Pedidos tab can open
// it. There's no "my orders" endpoint yet (ADR-004 Gaps); a returning
// customer on another device won't see their order here.

export const LAST_ORDER_STORAGE_KEY = "elpesado.lastOrder.v1";

export function parseLastOrderId(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function loadLastOrderId(): number | null {
  try {
    return parseLastOrderId(window.localStorage.getItem(LAST_ORDER_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function saveLastOrderId(orderId: number): void {
  try {
    window.localStorage.setItem(LAST_ORDER_STORAGE_KEY, String(orderId));
  } catch {
    // Storage full or blocked (private mode): the order page still works by URL.
  }
}

export function clearLastOrderId(): void {
  try {
    window.localStorage.removeItem(LAST_ORDER_STORAGE_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
