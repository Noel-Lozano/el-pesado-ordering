import { describe, expect, it } from "vitest";
import { parseCheckoutDraft } from "@/lib/checkoutDraft";

const draft = {
  name: "Ana",
  country: "MX",
  phoneInput: "656 123 4567",
  phone: "+526561234567",
  pickup: { kind: "scheduled", time: "2026-10-28T16:45:00.000Z" },
  idempotencyKey: "0b6d1b5e-6f1f-4f8e-9a37-5b1d3c2e7f10",
};

describe("parseCheckoutDraft", () => {
  it("round-trips a valid draft", () => {
    expect(parseCheckoutDraft(JSON.stringify(draft))).toEqual(draft);
    expect(parseCheckoutDraft(JSON.stringify({ ...draft, pickup: { kind: "asap" } }))?.pickup).toEqual({
      kind: "asap",
    });
  });

  it("returns null for missing, corrupt, or malformed drafts", () => {
    expect(parseCheckoutDraft(null)).toBeNull();
    expect(parseCheckoutDraft("{oops")).toBeNull();
    expect(parseCheckoutDraft(JSON.stringify({ ...draft, country: "CA" }))).toBeNull();
    expect(parseCheckoutDraft(JSON.stringify({ ...draft, pickup: { kind: "scheduled" } }))).toBeNull();
    expect(parseCheckoutDraft(JSON.stringify({ ...draft, idempotencyKey: undefined }))).toBeNull();
  });
});
