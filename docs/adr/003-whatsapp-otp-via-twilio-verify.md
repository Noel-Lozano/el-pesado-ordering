# ADR-003: Phone verification over WhatsApp via Twilio Verify, no SMS

**Status:** Proposed

**Date:** 2026-10-29

**Deciders:** Noel Lozano

## Context

ADR-001 verifies phone ownership with a 6-digit code that the backend
generates, hashes into an `otp_codes` table, and sends by Twilio SMS.
`architecture.md` §2 also planned SMS for order-status notifications
(confirmed / ready / pickup reminder).

Facts that bear on this:

- Most customers have Mexican numbers, where WhatsApp is the default way
  people message. Some customers are US students with `+1` numbers, and
  WhatsApp is less common among them.
- US-bound SMS requires A2P 10DLC registration before launch
  (`architecture.md` §2), which is an extra registration process on top
  of the Twilio account.
- Since March 2024, sending WhatsApp OTPs through Twilio (Verify or
  Programmable Messaging) requires the business's own WhatsApp sender: a
  phone number on a Meta-verified WhatsApp Business Account. Twilio's
  shared Verify sender was retired.
- WhatsApp authentication messages must use a Meta-approved template with
  fixed body text and a copy-code button.
- Twilio Verify can generate, send, expire, and check codes itself, with
  built-in rate limits and fraud protection. Sending with
  `channel=whatsapp` uses only WhatsApp. Automatic fallback to SMS is a
  separate pilot feature that Twilio enables per account on request.
- ADR-001's JWT design (a token carrying `customerId`, checked by
  `requireVerifiedPhone`) does not depend on how the code is delivered.
- `otp_codes` is empty, and no orders exist yet.

## Decision

We will verify phone numbers with Twilio Verify, using the WhatsApp channel
only, with no SMS fallback. We will drop our own OTP generation, hashing,
and the `otp_codes` table. Order-status updates will come only from the
order status page, which polls every 15 seconds, and not from SMS or
WhatsApp messages.

ADR-001's JWT approach stays as it is (with the expiry change from
ADR-002).

## Options considered

### Option A — Twilio Verify over WhatsApp (chosen)
- Pros: Twilio owns code generation, expiry, attempt limits, send rate
  limits, and SMS-pumping fraud protection, which closes the open "no rate
  limit on send-code" gap. Verify creates and maintains the WhatsApp
  authentication templates. There is less security-sensitive code of our
  own. Using no SMS removes the 10DLC registration.
- Cons: a per-verification fee on top of the WhatsApp message cost. The
  codes are no longer in our database (that data isn't needed). Customers
  without WhatsApp can't verify online. This depends on Twilio Verify
  availability.

### Option B — Keep ADR-001's own OTP, send by WhatsApp template
- Pros: cheaper per verification. Full control and visibility of codes and
  attempts.
- Cons: we keep and maintain the hashing, expiry, and attempt logic, and
  still need to build send rate limiting. We have to create and get
  approval for our own authentication template. There is no fallback path.

### Option C — Keep SMS (ADR-001 unchanged)
- Pros: already built. Works for every phone.
- Cons: needs A2P 10DLC registration for US numbers before launch. Less
  natural for the Mexican majority of customers. No built-in fraud
  protection on sends.

## Rationale

The customer base is mostly Mexican numbers, where WhatsApp is the default.
For a solo developer, moving code generation, attempt limits, and fraud
protection to Verify removes security-sensitive code instead of adding to
it. The per-verification fee is small at about 500 orders a day.

Going WhatsApp-only is an accepted reach tradeoff. It avoids 10DLC and the
SMS cost entirely. Customers without WhatsApp can still order by phone or
in person, which share the same kitchen capacity (`architecture.md` §5).

Dropping order notifications in favor of the live status page matches the
"boring" philosophy (`architecture.md` §1): the page already exists, and
polling every 15 seconds is adequate at this volume (ADR-002 decision 9).

## Consequences

- **Easier:** no OTP table, hashing, or attempt bookkeeping to maintain. No
  10DLC registration. No SMS spend. Send rate limiting and fraud protection
  come from Verify.
- **Harder:** launch now depends on Meta business verification, a
  registered WhatsApp sender, and that sender being attached to the Verify
  service.
  - Customers without WhatsApp, which is likely more common among `+1`
    numbers, can't order online.
  - Customers only learn their order is ready if they keep the status page
    open. The page alerts them visually and by vibration when the status
    becomes ready.
- **Migration:** `/auth/send-code` and `/auth/verify-code` keep their paths
  and response shapes, so the frontend is unaffected apart from its copy.
  `otp_codes` is dropped by a migration. `TWILIO_PHONE_NUMBER` is replaced
  by `TWILIO_VERIFY_SERVICE_SID`.
- **Revisit if:**
  - a meaningful share of attempted orders come from numbers without
    WhatsApp, which would mean adding SMS fallback (and 10DLC);
  - customers miss ready orders because they close the page, which would
    mean adding a WhatsApp "ready" message (it needs a utility template)
    or push notifications.

## Related

- Supersedes the code-generation and delivery parts of ADR-001: the
  `otp_codes` table, SHA-256 hashing, `OTP_EXPIRY_MINUTES`, and
  `OTP_MAX_ATTEMPTS`. ADR-001's JWT decision remains in force.
- ADR-002 decision 9 (order status by polling) now carries all
  notification.
- `architecture.md` §2 (SMS provider), §4 steps 2 and 6, §6 item 4 (the SMS
  pickup reminder is dropped for now).
