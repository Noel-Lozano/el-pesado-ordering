# ADR-006: Drop OXXO as a payment method

**Status:** Accepted

**Date:** 2026-11-11

**Deciders:** Noel Lozano

## Context

`architecture.md` planned three online payment methods through Stripe:
card, bank transfer, and OXXO. With OXXO the customer gets a voucher, pays
it in cash at an OXXO store, and Stripe confirms the payment later, so the
order would wait in `awaiting_payment` until then.

Facts that bear on this:

- People in Mexico use OXXO vouchers mostly for bills and larger
  purchases. Paying a voucher at a convenience store before picking up a
  burrito is not a normal way to pay for food, and few customers would
  choose it.
- Customers who want to pay in cash already can: cash on pickup, in MXN or
  USD (`architecture.md` §2).
- No payment method other than `cash` is built yet. `POST /orders`
  rejects everything else with `payment_method_unavailable`, so no order
  has ever been saved with `oxxo`.
- `oxxo` still appeared in the API's input schema and in the
  `orders_payment_method_check` constraint from migration `01`.

## Decision

We will not offer OXXO. Online payment methods are card and bank
transfer, through Stripe, plus cash on pickup. `oxxo` is removed from the
API's input schema and, by migration `07_drop-oxxo-payment-method`, from
the `orders_payment_method_check` constraint.

## Options considered

### Option A — Drop OXXO entirely (chosen)
- Pros: one less Stripe flow to build and test, including its voucher
  expiry and delayed confirmation webhooks. The database and API only
  allow methods the shop will actually offer.
- Cons: customers without a card who want to pay ahead can't. They can
  still pay cash on pickup.

### Option B — Keep OXXO in the schema, unbuilt
- Pros: no migration.
- Cons: the code and docs describe a payment method that will never
  exist, and the database accepts a value nothing should write.

## Rationale

OXXO adds a whole asynchronous payment flow for a method customers rarely
use for food, and cash on pickup already covers paying in cash. Removing
it now, before any payment is built, costs one small migration and keeps
the schema honest (`coding_standards.md` §1: explicit over implicit).

## Consequences

- **Easier:** Phase 3 (Stripe) builds two online methods, not three.
- **Unchanged:** `payment_status = 'awaiting_payment'` stays, because bank
  transfers also settle after the order is placed.
- **Harder:** a customer with no card and no wish to pay at pickup has no
  way to pay ahead. No-show mitigation (`architecture.md` §6) still falls
  back to card for customers blocked from cash on pickup.
- **Revisit if:** customers ask to pay ahead in cash, or no-shows on cash
  orders become a problem that a prepaid cash option would solve.

## Related

- `architecture.md` §2 (Payments), §4 step 4 (payment branches) and §6
  item 2: updated to remove OXXO.
- Migration `07_drop-oxxo-payment-method` (reversible to migration
  `01`'s constraint).
