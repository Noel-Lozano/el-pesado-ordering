# ADR-001: Phone OTP verification with short-lived JWTs for order authentication

**Status:** Accepted

**Date:** 2026-08-26

**Deciders:** Noel Lozano

## Context

`architecture.md` establishes that customer identity is the phone number and
that verification happens via SMS OTP (§4, step 2), with no password-based
accounts (§7). It does not specify how a customer proves phone ownership on
subsequent requests after the OTP exchange — in particular, the order
creation endpoint needs to know which verified customer is placing an order
without trusting a client-supplied `phone` or `customerId` field in the
request body, since that would let anyone place orders (and no-show) as
another customer.

The system is a single Node/Express backend with Postgres as the only
datastore (no Redis/cache layer per `architecture.md` §1's "no infrastructure
complexity ahead of proven need"), so any session mechanism needs to work
within that constraint.

## Decision

We will verify phone ownership via a 6-digit OTP sent over Twilio SMS,
store the OTP as a SHA-256 hash (not the raw code) in a new `otp_codes`
table, and — on successful verification — issue a short-lived (15 minute)
signed JWT identifying the `customerId`. Endpoints that require a verified
phone (starting with order creation) require this JWT via an
`Authorization: Bearer <token>` header, checked by the
`requireVerifiedPhone` middleware, which is the only source of truth for
`customerId` on those routes — no request body field is trusted for
identity.

Brute-force protection on the OTP itself comes from `OTP_MAX_ATTEMPTS`
(default 5) and `OTP_EXPIRY_MINUTES` (default 5), enforced inside a
`SELECT ... FOR UPDATE` transaction, rather than from a slow hash — the
same class of guarantee `architecture.md` §5 requires for capacity-slot
locking.

## Options considered

### Option A — Short-lived stateless JWT (chosen)
- Pros: no server-side session storage needed, consistent with the
  "one backend, one database" philosophy; verification is a pure function
  of the signing secret, so it works identically across every future
  backend instance without shared session state; short TTL (15 min) limits
  the blast radius of a leaked token.
- Cons: cannot be revoked before expiry short of rotating `JWT_SECRET` for
  everyone; requires the client to re-run the OTP flow every 15 minutes for
  a new order.

### Option B — Server-side session (session table + cookie)
- Pros: revocable at will; longer-lived sessions possible without
  re-verifying phone ownership as often.
- Cons: adds a new stateful concept (session table, cookie handling,
  expiry sweeps) for a single-instance backend that doesn't need it yet;
  more moving parts than the problem currently justifies.

### Option C — Trust a `phone`/`customerId` field on each request
- Pros: simplest to implement, no token at all.
- Cons: not actually authentication — any client can claim to be any
  customer, which directly undermines the no-show tracking and
  cash-on-pickup gating in `architecture.md` §6. Rejected outright.

## Rationale

Given the project's explicit "boring, small system" philosophy
(`architecture.md` §1) and the single-backend/single-database constraint,
a stateless signed token avoids introducing session infrastructure this
scale doesn't need, while still closing the identity-spoofing gap that
Option C leaves open. The 15-minute expiry is short enough that a leaked
token is low-value, and matches the natural lifespan of a single
order-placement session (browse → verify → order).

## Consequences

- Order creation (and any future customer-scoped endpoint) can trust
  `req.customer.customerId` set by `requireVerifiedPhone` instead of
  re-deriving identity from request input.
- A customer must re-verify their phone (new OTP) roughly every 15 minutes
  of inactivity — acceptable for a single-sitting ordering flow, but would
  need revisiting if we ever want a "remember me" experience longer than
  that.
- There is no token revocation path. If this becomes a problem (e.g. a
  customer needs to be blocked mid-session), the fix today is rotating
  `JWT_SECRET` (invalidates all tokens) — a real revocation list would
  need Option B's session storage, which we are explicitly deferring.
- `otp_codes` is a new table with no automatic cleanup of expired rows;
  revisit if row growth becomes a real concern (it wasn't in scope for
  this change).

## Related

- `architecture.md` §4 (order flow, phone OTP step), §6 (no-show
  mitigation, which depends on identity being trustworthy), §7 (no
  password-based accounts)
- `coding_standards.md` §10 (phone numbers must be masked in logs — the
  OTP flow never logs a raw phone number or code)
