# ADR-002: Frontend MVP Architecture and Ordering Flow

- **Status:** Proposed. Change to Accepted after implementation, and update any section that changed.
- **Date:** 2026-09-24
- **Deciders:** Noel
- **Related:** `docs/plans/frontend-mvp-plan.md`, `architecture.md`

> **Post-implementation checklist:** Before accepting this ADR, fill in every `TODO`, record any deviations in "Implementation Notes," and confirm that the Consequences section still matches what shipped.

---

## Context

Burritos El Pesado needs mobile-first online ordering. Most customers are university students near the Mexico–US border who order from their phones, often on weak signal. For the MVP, payment is cash at pickup, so nothing financial discourages fake or no-show orders. The backend (Express + Supabase) already provides OTP auth over Twilio SMS and JWT middleware. The frontend is Next.js (App Router), deployed to Vercel, while the API runs on a different domain (Railway or Render).

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
Each step is its own route. The mobile back button, page refresh, and deep links (an SMS linking to `/orders/[id]`) all behave predictably.

**Alternative considered:** A cart drawer and checkout modal. They offer smoother UX, but back-button and refresh behavior are fragile. They can be revisited after the MVP.

### 3. Menu rendered as a server component with ISR (`revalidate: 60`)
The menu changes rarely. Rendering it on the server gives a fast first paint on weak connections, requires no client loading state on the most important screen, and makes the page indexable.

### 4. Cart in React Context with `useReducer`, persisted to `localStorage`
Mobile browsers routinely kill background tabs, and losing a cart loses the sale. Cart lines are keyed by `menuItemId`, never by name, so that renaming a menu item doesn't break saved carts or order history.

**Alternative considered:** A state library such as Zustand or Redux. It's unnecessary for the MVP, since there is only one cart and one auth state.

### 5. The server is authoritative for prices
Client-side prices are for display only. `POST /orders` recomputes all totals from the database and rejects inactive or unknown items. Otherwise, a customer could change the price in the browser.

### 6. JWT stored in `localStorage` (accepted tradeoff)
The frontend (Vercel) and API (Railway or Render) are on different domains, which makes httpOnly cookies difficult because of cross-site cookie restrictions. For the MVP, the JWT is kept in `localStorage` with a short expiry of about 24h.

**Risk:** a successful XSS attack could read the token. **Mitigations:** React escapes output by default, the app loads no third-party scripts, the token is short-lived, and it only grants access to that phone number's orders.

**Revisit when:** a custom domain is set up (`elpesado.com` for the app, `api.elpesado.com` for the API). At that point, move to a same-site httpOnly cookie.

### 7. Idempotency key on order creation
The client generates a UUID when the checkout page mounts and sends it as `Idempotency-Key`. The server returns the existing order if it has already seen that key. This prevents duplicate orders caused by double-taps or network retries on mobile.

### 8. Free-text notes per line instead of a modifier system
Each cart line has a note of at most 140 characters, which the kitchen reads the same way it reads a paper ticket. Paid add-ons remain separate items in the `Extras` category.

**Revisit when:** customers frequently request paid customizations that notes can't handle.

### 9. Order status via polling every 15 seconds, with SMS as the primary notification
Polling is simple and easy to debug, and it is adequate at this shop's order volume.

**Alternative considered:** Supabase Realtime or websockets. They are more responsive but add connection handling that the MVP doesn't need.

### 10. Spanish-first UI with all strings in `lib/strings.ts`
Keeping every UI string in one file means adding English later is a new file, not a refactor. All prices are formatted through `formatMXN()`.

### 11. Menu API hides incomplete items
`GET /menu` returns only items where `is_active = true AND price > 0`, so items with missing data (such as Discada) cannot go live by accident.

---

## Consequences

**Positive**
- Customers can order without creating an account, and every order is tied to a verified phone number.
- Carts survive tab kills and refreshes.
- Price tampering and duplicate submissions are blocked on the server.
- Each deferred feature (accounts, modifiers, realtime, cookies, English) has a clear upgrade path that doesn't require rewriting the MVP.

**Negative / accepted risks**
- The JWT in `localStorage` is exposed to XSS, as described in decision 6.
- Returning customers must re-verify by OTP every time, and each verification incurs a Twilio SMS cost.
- Order status can lag by up to 15 seconds.
- Notes are unstructured, so the kitchen has to interpret them.

**Follow-ups**
- [ ] Custom domain, then migrate the JWT to an httpOnly cookie
- [ ] Twilio A2P 10DLC registration before launch
- [ ] Set Discada's price
- [ ] Stripe Mexico (Phase 3), which will change the checkout and verify steps

---

## Implementation Notes

*Fill in this section after implementation.*

- **Deviations from this ADR or the spec:** TODO
- **Idempotency storage approach and migration name:** TODO
- **Final JWT expiry value:** TODO
- **Anything learned that should change a decision above:** TODO