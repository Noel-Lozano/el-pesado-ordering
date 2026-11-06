# ADR-002: Frontend MVP Architecture and Ordering Flow

- **Status:** Accepted (2026-11-06), after slices 0–6 of `docs/plans/frontend-mvp-plan.md`. Sections that changed during implementation have been updated; see Implementation Notes.
- **Date:** 2026-09-24
- **Deciders:** Noel
- **Related:** `docs/plans/frontend-mvp-plan.md`, `architecture.md`

> **Post-implementation checklist:** Before accepting this ADR, fill in every `TODO`, record any deviations in "Implementation Notes," and confirm that the Consequences section still matches what shipped.

---

## Context

Burritos El Pesado needs mobile-first online ordering. Most customers are university students near the Mexico–US border who order from their phones, often on weak signal. For the MVP, payment is cash at pickup, so nothing financial discourages fake or no-show orders. The backend (Express + Supabase) already provides phone OTP auth and JWT middleware; per ADR-003 the code is delivered over WhatsApp by Twilio Verify. The frontend is Next.js (App Router), deployed to Vercel, while the API runs on a different domain (Railway or Render).

The main forces behind these decisions are:
- **Conversion:** every step before a customer sees the menu costs orders.
- **Trust:** with no payment up front, the shop needs some assurance that an order is real.
- **Scope:** a solo developer needs a shippable MVP.
- **Security:** prices and order ownership must be enforced on the server.

---

## Decisions

### 1. Guest-first flow, with OTP only at checkout
The flow is Menu → Cart → Checkout → OTP Verify → Confirmation. There are no accounts. Phone OTP acts as both identification and anti-fraud verification, and it happens only when the customer commits to an order.

**Alternatives considered:** Login before browsing was rejected because it adds friction before the customer sees any value. Guest checkout with no verification was rejected because, with cash payment, fake orders would cost the shop food.

### 2. Real routes instead of modals or drawers
Each step is its own route. The mobile back button, page refresh, and deep links (a shared link to `/orders/[id]`) all behave predictably.

**Alternative considered:** A cart drawer and checkout modal. They offer smoother UX, but back-button and refresh behavior are fragile. They can be revisited after the MVP.

### 3. Menu rendered as a server component with ISR (`revalidate: 60`)
The menu changes rarely. Rendering it on the server gives a fast first paint on weak connections, requires no client loading state on the most important screen, and makes the page indexable.

### 4. Cart in React Context with `useReducer`, persisted to `localStorage`
Mobile browsers routinely kill background tabs, and losing a cart loses the sale. Cart lines are keyed by `menuItemId`, never by name, so that renaming a menu item doesn't break saved carts or order history.

**Alternative considered:** A state library such as Zustand or Redux. It's unnecessary for the MVP, since there is only one cart and one auth state.

### 5. The server is authoritative for prices
Client-side prices are for display only. `POST /orders` recomputes all totals from the database and rejects inactive or unknown items. Otherwise, a customer could change the price in the browser.

### 6. JWT stored in `localStorage` (accepted tradeoff)
The frontend (Vercel) and API (Railway or Render) are on different domains, which makes httpOnly cookies difficult because of cross-site cookie restrictions. For the MVP, the JWT is kept in `localStorage` with a short expiry of about 24h. While it's valid, a returning customer ordering with the same phone skips the WhatsApp code (the device is "remembered", `architecture.md` §4.2).

**Risk:** a successful XSS attack could read the token. **Mitigations:** React escapes output by default, the app loads no third-party scripts, the token is short-lived, and it only grants access to that phone number's orders.

**Revisit when:** a custom domain is set up (`elpesado.com` for the app, `api.elpesado.com` for the API). At that point, move to a same-site httpOnly cookie.

### 7. Idempotency key on order creation
The client generates a UUID once per checkout (stored with the checkout form in `sessionStorage`, cleared when the order succeeds) and sends it as `Idempotency-Key`. The server returns the existing order if it has already seen that key for that customer. The key is not regenerated when the checkout page mounts again: going back from verify to checkout and resubmitting must reuse it. This prevents duplicate orders caused by double-taps or network retries on mobile.

### 8. Free-text notes per line instead of a modifier system
Each cart line has a note of at most 140 characters, which the kitchen reads the same way it reads a paper ticket. Paid add-ons remain separate items in the `Extras` category.

**Revisit when:** customers frequently request paid customizations that notes can't handle.

### 9. Order status via polling every 15 seconds on a live status page, which is the only notification
Polling is simple and easy to debug, and it is adequate at this shop's order volume. No SMS or WhatsApp status messages are sent (ADR-003). When the order becomes ready, the page shows a prominent banner, changes the tab title, and vibrates the phone if the page is open.

**Alternative considered:** Supabase Realtime or websockets. They are more responsive but add connection handling that the MVP doesn't need.

### 10. Spanish-first UI with all strings in `lib/strings.ts`
Keeping every UI string in one file means adding English later is a new file, not a refactor. All prices are formatted through `formatMXN()`.

### 11. Menu API hides incomplete items
`GET /menu` returns only items where `is_available AND price_cents > 0`, so an item seeded without a price cannot go live by accident.

---

## Consequences

**Positive**
- Customers can order without creating an account, and every order is tied to a verified phone number.
- Carts survive tab kills and refreshes.
- Price tampering and duplicate submissions are blocked on the server.
- Each deferred feature (accounts, modifiers, realtime, cookies, English) has a clear upgrade path that doesn't require rewriting the MVP.

**Negative / accepted risks**
- The JWT in `localStorage` is exposed to XSS, as described in decision 6.
- Returning customers skip the code while their 24h token for the same phone is still valid (decided 2026-11-04). After that they verify again, and each verification incurs a Twilio Verify plus WhatsApp cost.
- Customers only see that their order is ready while the status page is open.
- Order status can lag by up to 15 seconds.
- Notes are unstructured, so the kitchen has to interpret them.

**Follow-ups**
- [ ] Custom domain, then migrate the JWT to an httpOnly cookie
- [ ] Meta business verification and a WhatsApp sender attached to the Twilio Verify service, before launch (ADR-003)
- [x] Set Discada's price (the menu seed prices it: burrito $65, montada $80)
- [ ] Stripe Mexico (Phase 3), which will change the checkout and verify steps

---

## Implementation Notes

- **Deviations from this ADR or the spec:** each one, with its reason, is in `docs/plans/frontend-mvp-plan.md` ("Deviations from the spec" and the "Found during slice N" notes). The main ones:
  - **Routes:** the existing `/api/v1/auth/send-code` and `/verify-code` routes are used, not the spec's `/auth/otp/*`. The frontend uses the `src/` layout and reads `NEXT_PUBLIC_API_BASE_URL`.
  - **Prices:** prices are integer centavos throughout (`price_cents`, `formatMXN(cents)`).
  - **Category on lines:** cart and order lines carry the category, because 17 item names repeat across Burritos and Montadas.
  - **Shop hours:** pickup is same-day only, Monday–Saturday 07:30–15:30 in `America/Ciudad_Juarez`. Orders are only taken while the shop is open. Items with `available_from` (after 2 PM) are enforced by the server.
  - **Order status page without a login:** it explains how to pick up instead of redirecting to checkout.
  - **Verification channel:** codes go over WhatsApp via Twilio Verify, with no SMS and no status messages (ADR-003).
- **Idempotency storage approach and migration name:**
  - **Storage:** a nullable `orders.idempotency_key uuid` with a partial unique index `orders_customer_idempotency_key_uniq` on `(customer_id, idempotency_key)`, added by migration `05_order-idempotency`.
  - **Lookup:** the server looks the key up before validating hours. A concurrent duplicate hits the unique index (`23505`) and gets the winning order back with 200.
- **Final JWT expiry value:** `24h` (`VERIFIED_PHONE_TOKEN_EXPIRY` in `backend/src/lib/jwt.ts`). The client reuses a stored token only when it has at least 10 minutes left.
- **Anything learned that should change a decision above:**
  - **Decision 4:** the add-to-cart button must stay disabled until the saved cart has loaded. Otherwise a tap before hydration is lost, or overwritten when the saved cart loads.
  - **Decision 9:** the status page also pauses polling while the tab is hidden and keeps the last known status visible when a poll fails.
  - **Still open:** whether ASAP orders need a last-order cutoff before 15:30.