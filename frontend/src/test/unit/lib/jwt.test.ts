import { describe, expect, it } from "vitest";
import { getTokenExpiryMs, isTokenUsable } from "@/lib/jwt";

function fakeToken(payload: object): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.signature`;
}

const now = new Date("2026-11-04T17:00:00Z");
const nowSeconds = now.getTime() / 1000;

describe("getTokenExpiryMs", () => {
  it("reads exp from the payload", () => {
    expect(getTokenExpiryMs(fakeToken({ customerId: 1, exp: nowSeconds + 60 }))).toBe(now.getTime() + 60_000);
  });

  it("handles base64url characters in the payload", () => {
    // "ñ" and "?>" produce "-" / "_" once base64url-encoded.
    expect(getTokenExpiryMs(fakeToken({ note: "ñ?>?>", exp: 1 }))).toBe(1000);
  });

  it("returns null for malformed tokens or a missing exp", () => {
    expect(getTokenExpiryMs("not-a-jwt")).toBeNull();
    expect(getTokenExpiryMs("a.%%%.c")).toBeNull();
    expect(getTokenExpiryMs(fakeToken({ customerId: 1 }))).toBeNull();
  });
});

describe("isTokenUsable", () => {
  it("accepts a token with plenty of time left", () => {
    expect(isTokenUsable(fakeToken({ exp: nowSeconds + 23 * 3600 }), now)).toBe(true);
  });

  it("rejects expired tokens and ones about to expire", () => {
    expect(isTokenUsable(fakeToken({ exp: nowSeconds - 1 }), now)).toBe(false);
    expect(isTokenUsable(fakeToken({ exp: nowSeconds + 5 * 60 }), now)).toBe(false);
  });
});
