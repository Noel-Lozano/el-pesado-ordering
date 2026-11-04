# Architecture — Burrito Ordering App

## 1. Overview

A web/PWA ordering system for a single-location burrito business near a
university, on the Mexico–US border. Customers order online for in-store
pickup (ASAP or scheduled); orders are pushed to a staff-facing screen in
the store. Target scale: ~500 orders/day across online, phone, and
in-store channels, with heavy concentration during a lunch rush. The
customer base spans both Mexican and American phone numbers, and both
MXN and USD are accepted in person.

**Design philosophy:** this is intentionally a small, boring system. No
microservices, no message queues, no Kubernetes. One backend, one database.
The complexity in this product lives in the business rules (kitchen
capacity, no-show handling, multi-channel orders), not in the infrastructure.
Do not add infrastructure complexity ahead of proven need — see ADRs for any
exception to this.

## 2. System components

```
Customer app (Web/PWA)  ──┐
                           ├──▶  Backend server  ──▶  Postgres (source of truth)
Store screen (staff)   ──┘        │        │
                                   │        └──▶ Object storage (menu images)
                                   └──▶ Stripe (card / OXXO / bank transfer)
                                   └──▶ Twilio Verify (WhatsApp OTP)
```

- **Customer app** — Next.js (React), deployed as a PWA. No native app.
- **Store screen** — same backend, a staff-only view. Real-time updates via
  WebSocket, with polling as a fallback if the socket connection drops.
  The database is always the source of truth; WebSocket is a notification
  layer on top, never the only path an order can arrive by.
- **Backend** — single Node.js/Express service (or Next.js API routes).
  Owns order creation, capacity checks, payment orchestration, and
  notification triggers.
- **Database** — PostgreSQL. Relational by nature (orders → order items →
  menu items → customers), and we need transactional guarantees around
  capacity-slot booking.
- **Object storage** — S3 or Cloudflare R2 for menu photos. Images are
  never stored in Postgres; only their URLs are.
- **Payments** — Stripe (Mexico entity). All online charges (card, OXXO,
  bank transfer) are created in MXN, regardless of whether the card is
  Mexican or American — the customer's own bank handles USD↔MXN
  conversion on their end, the same way any cross-border card purchase
  works. The app does not compute or store an exchange rate for these.
  Cash-on-pickup is handled entirely in-app as a marker (no Stripe
  involvement); staff accept either MXN or USD cash in person, at
  whatever rate the shop is posting that day — this is a physical,
  at-the-register transaction, not something the app calculates.
- **Phone verification** — Twilio Verify sends the OTP over WhatsApp
  only, with no SMS (ADR-003). That needs the shop's own WhatsApp sender,
  on a Meta-verified WhatsApp Business Account, attached to the Verify
  service. Phone numbers are stored in E.164 format (`+52...` /
  `+1...`) since the customer base includes both Mexican and American
  numbers. Order status is not pushed by message: the customer's live
  status page polls for it (ADR-002 decision 9).
- **Hosting** — split by concern rather than one platform for everything:
  - Frontend (Next.js) → **Vercel** (best-in-class Next.js delivery,
    free at this scale).
  - Backend (API + WebSocket for the store screen) → **Railway** or
    **Render**. Vercel's serverless model doesn't suit a long-running
    WebSocket connection, so the backend needs a platform built for
    always-on processes.
  - Database → **Neon** or **Supabase** (managed Postgres, connection
    pooling built in — matters given lunch-rush concurrency, §5).
  - Domain/DNS → any registrar (e.g. Cloudflare Registrar, Namecheap),
    proxied through Cloudflare for free SSL and DDoS protection.
  - Estimated cost at this scale: roughly $10–25/month all-in, before
    Stripe/Twilio per-transaction fees.

## 3. Data model (core entities)

```
customers      (id, phone [unique, verified], name, no_show_count,
                is_blocked, created_at)

menu_items     (id, name, description, price, image_url, category,
                is_available)

orders         (id, customer_id, channel, status, fulfillment_type,
                requested_time, estimated_ready_at, payment_method,
                payment_status, currency_paid, total, created_at)

order_items    (id, order_id, menu_item_id, quantity,
                price_at_order, notes)

capacity_slots (id, day_of_week OR date, start_time, end_time,
                max_orders)
```

Key decisions embedded in this schema:

- `price_at_order` is captured per line item so historical orders are
  unaffected by later menu price changes.
- `channel` (`online` / `phone` / `in_store`) exists because all three
  compete for the same kitchen capacity — the online system cannot be the
  only thing that knows the kitchen is busy.
- `requested_time` (customer's stated intent) is kept separate from
  `estimated_ready_at` (the system's live estimate), so the system can
  adjust estimates under load without silently rewriting what the
  customer asked for.
- `currency_paid` (`MXN` / `USD`) is only meaningful for cash orders — it
  records what was physically handed over, for bookkeeping/reconciliation.
  It is never used to compute anything; the app performs no currency
  conversion. Online orders are always `MXN` (the currency the Stripe
  charge is created in), regardless of the customer's card or bank.

## 4. Order flow (high level)

1. Customer selects items + pickup time (ASAP or scheduled).
2. Phone number is verified via an OTP sent over WhatsApp (ADR-003)
   (device remembered after first verification to reduce repeat friction).
3. Backend checks the relevant `capacity_slots` row for availability
   **before** payment is attempted, using `SELECT ... FOR UPDATE` inside a
   transaction to prevent two simultaneous requests from overbooking the
   same slot.
4. Payment branches by method:
   - **Card** — charged immediately via Stripe.
   - **OXXO** — voucher issued, order held as `awaiting_payment` until
     Stripe confirms payment (asynchronous).
   - **Cash on pickup** — no charge now; `payment_status = unpaid` until
     staff mark it paid at handoff.
5. Confirmed order is pushed to the store screen (WebSocket) and saved to
   Postgres regardless of socket delivery.
6. Kitchen prepares; the customer's status page (polling every 15 s)
   shows when the order is ready.
7. At pickup, staff match the order by name + last 4 digits of phone
   (name alone is not reliable — collisions happen).
8. If a scheduled cash order isn't collected within a grace period after
   `estimated_ready_at`, it's auto-cancelled, the slot is released, and
   the customer's `no_show_count` is incremented.

## 5. Capacity model

`capacity_slots` defines max orders per time window (e.g. per 15 minutes,
tighter during lunch rush, coarser off-peak). Every order — regardless of
channel — decrements the relevant slot. This is the single mechanism that
prevents the kitchen from being oversold, whether the order came from the
app, a phone call, or a walk-in logged by staff.

Concurrency correctness matters here specifically because of the lunch
rush: simultaneous requests for the last slot must be serialized at the
database level (row locking), not just checked-then-written in application
code.

## 6. No-show mitigation

Cash-on-pickup has no upfront financial commitment, so it's the one path
most exposed to no-shows. Mitigations, in order of what's built first:

1. Verified phone number required for every order (OTP).
2. `no_show_count` tracked per customer; after a threshold, cash-on-pickup
   is disabled for that customer (they can still order with card/OXXO).
3. Grace period auto-release of unpicked scheduled orders, freeing the
   capacity slot.
4. (Deferred by ADR-003) a pickup reminder message to reduce *accidental*
   no-shows. For now the live status page is the only reminder.
5. (Reserved, not built initially) small non-refundable deposit for cash
   orders, if no-show rates prove to be a real problem once we have data.

## 7. Explicit non-goals for MVP

- No native iOS/Android apps.
- No microservices / event bus / container orchestration.
- No customer accounts with passwords — phone number is the identity.
- No delivery — pickup only.
- No multi-location support.

## 8. Open questions

- Grace period length before auto-cancelling a no-show.
- Whether `no_show_count` should decay over a rolling window.
- Slot granularity during peak vs. off-peak (starting point: 15 min
  off-peak, 5 min during lunch rush — to be tuned with real data).

## 9. Related documents

- `coding_standards.md` — conventions for this codebase.
- `adr_template.md` — template for recording significant decisions as they
  come up (e.g. deposit requirement, delivery expansion, multi-location).
