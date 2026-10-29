# Frontend MVP: Implementation Spec (Plan First)

## Instructions for Claude Code

**Do not write any implementation code yet.** Your first deliverable is an **implementation plan** for my review.

1. Read `CLAUDE.md` and the docs it imports (`architecture.md`, `coding_standards.md`), and explore `backend/` to learn the existing routes, middleware, migrations, and response shapes.
2. Write the plan to `docs/plans/frontend-mvp-plan.md` using the "Plan Format" section at the bottom of this file.
3. Stop and wait for my approval. I will edit the plan directly. Treat my edited version as the source of truth.
4. After approval, implement **one slice at a time** (see "Build Slices"). Stop after each slice so I can review it before you continue.

If anything in this spec conflicts with the existing code or docs, **do not silently pick one.** List the conflict in the plan's "Open Questions" section.

---

## Context

- The app is **El Pesado Ordering**, online ordering for Burritos El Pesado, a burrito shop on the Mexico–US border near a university.
- Most customers are students ordering on phones, often on weak cell signal.
- The repo has two standalone folders, `backend/` (Express, already scaffolded) and `frontend/` (to be created). It is **not** a monorepo with workspaces.
- The stack is Next.js (App Router) + TypeScript + Tailwind CSS, deployed to Vercel as a PWA. The backend is on Railway or Render, with Postgres via Supabase.
- The backend already has OTP auth routes (`POST /auth/otp/send`, `POST /auth/otp/verify`), JWT middleware, and Twilio.
- The menu has 35 seeded items across 5 categories: Burritos, Montadas, Extras, Desayunos, Burritos Pa' la Comida.
- All prices are **MXN integers**. Payment for the MVP is **cash at pickup** only (Stripe comes in Phase 3).
- Phone numbers are stored in **E.164** format. Both `+52` (MX) and `+1` (US) must be supported.

---

## Screen Flow

```
/ (Menu) → /cart → /checkout → /checkout/verify → /orders/[id]
```

The flow is **guest-first**. The customer never logs in before browsing. The phone number is verified via OTP only at checkout, and that verification both identifies the customer and proves the number is real, which matters because there is no payment to deter no-show orders.

| Route | Rendering | Responsibility |
|---|---|---|
| `app/page.tsx` | Server component, `revalidate: 60` | Fetch `GET /menu` and render items grouped by category in `display_order` |
| `app/cart/page.tsx` | Client | List line items, edit quantity, add a per-line note, show subtotal, button to checkout |
| `app/checkout/page.tsx` | Client | Collect name, phone, and pickup time (ASAP or scheduled). On submit, call `POST /auth/otp/send` and go to verify |
| `app/checkout/verify/page.tsx` | Client | Enter OTP, call `POST /auth/otp/verify`, then immediately call `POST /orders`, then `router.replace('/orders/:id')` |
| `app/orders/[id]/page.tsx` | Client | Show the confirmation and poll `GET /orders/:id` every 15 seconds for status |

**Use real routes, not modals or drawers.** The back button and page refresh must behave predictably on mobile.

---

## Required Behavior

### Cart (`context/CartContext.tsx`)
- Use `useReducer`, persisted to `localStorage` so the cart survives tab kills and refreshes. Wrap every storage access in try/catch and fall back to an empty cart.
- A line item has the shape `{ menuItemId, name, unitPrice, quantity, note }`.
- **Key lines by `menuItemId`, never by name.**
- `unitPrice` is for **display only**. The backend recomputes all totals from the database.
- Each line has a free-text `note` capped at 140 characters, for requests like "sin cebolla" or "extra salsa." **Do not build a modifier system.**
- Clear the cart only after `POST /orders` succeeds.

### Auth (`context/AuthContext.tsx`)
- The context holds `{ token, phone, setToken, clear }`.
- Store the JWT in `localStorage` for the MVP. This is an accepted tradeoff because the frontend and API are on different domains; see the ADR.
- The backend should issue short-lived tokens (about 24h). A 401 from any request clears auth and sends the user back to `/checkout` with the cart intact.

### API layer (`lib/api.ts`)
- **All** network calls go through a single wrapper. It is responsible for the base URL (`NEXT_PUBLIC_API_URL`), the JWT `Authorization` header, a consistent error shape, and 401 handling.
- No component calls `fetch` directly.

### Order submission
- Generate an **idempotency key** (UUID) when the checkout page mounts, and send it as the `Idempotency-Key` header on `POST /orders`.
- After success, use `router.replace` (not `push`) so the back button cannot re-submit the order.
- Disable the submit button while a request is in flight.

### Pickup time
- The customer chooses ASAP or a scheduled time. For ASAP, `requested_time` is `null`, since the column is nullable.

### Display helpers
- `lib/money.ts` exports `formatMXN()`. **All** price display goes through it.
- `lib/phone.ts` normalizes input to E.164 for `+52` and `+1` numbers.
- `lib/strings.ts` holds all UI copy. The UI is **Spanish-first**, and there must be no hardcoded strings in components, so that adding English later means adding a file, not editing every component.

---

## Backend Work Required

The frontend depends on these endpoints. Include them in the plan and check first whether any of them already exist.

- **`GET /menu`** returns only items with `is_active = true` **and** `price > 0`, sorted by category and then `display_order`. The price filter keeps items with missing prices (such as Discada) hidden automatically.
- **`POST /orders`** requires a JWT.
  - It **recomputes all prices from the database** and ignores any client-sent prices.
  - It rejects inactive or unknown `menuItemId`s.
  - It honors `Idempotency-Key`: if the key has been seen before, it returns the existing order instead of creating a duplicate. This may need a migration.
  - It accepts a nullable `requested_time`.
- **`GET /orders/:id`** requires a JWT and returns the order **only if it belongs to the JWT's phone number**.

---

## Folder Structure

```
frontend/
  app/
    layout.tsx               # CartProvider + AuthProvider
    page.tsx
    cart/page.tsx
    checkout/page.tsx
    checkout/verify/page.tsx
    orders/[id]/page.tsx
  components/
    menu/      CategorySection.tsx, MenuItemCard.tsx, AddToCartButton.tsx
    cart/      CartLine.tsx, CartSummary.tsx, CartBar.tsx
    checkout/  PickupTimePicker.tsx, PhoneInput.tsx, OtpInput.tsx
  context/     CartContext.tsx, AuthContext.tsx
  lib/         api.ts, money.ts, phone.ts, strings.ts
  types/       menu.ts, order.ts
```

`CartBar` is a sticky bottom bar (for example, "Ver carrito (3) · $240") that appears on the menu page whenever the cart is not empty.

---

## Build Slices

Implement the slices in this order. Each slice must leave the app runnable and demoable.

1. **Foundation and menu:** scaffold `frontend/`, add types, `lib/api.ts`, `money.ts`, and `strings.ts`, build the backend `GET /menu`, and render the menu read-only.
2. **Cart:** add `CartContext`, the add-to-cart button, `/cart`, and `CartBar`.
3. **Checkout form:** build `/checkout` with `PhoneInput` (E.164 normalization) and `PickupTimePicker`, wired to `POST /auth/otp/send`.
4. **Verify and create the order:** build the backend `POST /orders` (with idempotency) and `/checkout/verify`, completing the end-to-end path from OTP to order.
5. **Confirmation:** build the backend `GET /orders/:id` and the `/orders/[id]` page with polling.
6. **Polish:** add the PWA manifest, loading and error states, empty-cart state, tap targets of at least 44px, and a pass at 360px screen width.

---

## Out of Scope (Do Not Build)

Leave out the following, even if they seem easy:

- User accounts, profiles, or order history
- A modifier or add-on system
- Online payments (Stripe comes in Phase 3)
- Realtime updates via websockets or Supabase Realtime
- An admin or kitchen dashboard
- An English translation, beyond the `strings.ts` structure itself

---

## Plan Format

Structure `docs/plans/frontend-mvp-plan.md` with the following sections.

1. **Findings:** what exists in `backend/` today that affects this spec, including route names, response shapes, and the JWT payload contents.
2. **Open Questions:** conflicts, ambiguities, or anything you would otherwise have to guess.
3. **Per slice:**
   - Files to create or modify, with full paths
   - Backend changes, including any migrations with their proposed SQL
   - Key types and function signatures
   - Acceptance criteria: how I verify the slice manually
   - Risks or tradeoffs
4. **Environment variables** needed for the frontend and backend.
5. **Deviations** from this spec, with a reason for each.