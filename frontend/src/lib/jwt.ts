// Reads the expiry from the login token so a returning customer can skip the
// WhatsApp code while their token is still good (decided 2026-11-04). This
// does NOT verify the token; the server does that on every request and
// answers 401 if it disagrees.

// Don't reuse a token that would expire mid-order.
const MIN_REMAINING_MS = 10 * 60_000;
const MS_PER_SECOND = 1000;

function decodeBase64Url(segment: string): string {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return atob(padded);
}

export function getTokenExpiryMs(token: string): number | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const { exp } = JSON.parse(decodeBase64Url(payload)) as { exp?: unknown };
    return typeof exp === "number" ? exp * MS_PER_SECOND : null;
  } catch {
    return null;
  }
}

export function isTokenUsable(token: string, now: Date): boolean {
  const expiryMs = getTokenExpiryMs(token);
  return expiryMs !== null && expiryMs - now.getTime() >= MIN_REMAINING_MS;
}
