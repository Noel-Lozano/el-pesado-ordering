# Frontend MVP Plan: El Pesado Ordering

> Source docs: `docs/adr/002-frontend-architecture.md`, `docs/implementation_spec/frontend_implementation.md`.
> On approval, this file is copied to `docs/plans/frontend-mvp-plan.md` (the path the spec asks for), and that copy becomes the source of truth for your edits. Implementation then goes **one slice at a time, stopping after each slice for review**.

## Context

The shop needs a mobile-first, guest-first ordering flow: Menu → Cart → Checkout → OTP → Confirmation, with cash at pickup. The backend already has OTP auth, JWT middleware, and a first version of `POST /orders`. The frontend is a fresh Next 16.3 scaffold under `frontend/src/app`, with an uncommitted switch to Tailwind v3. This plan reconciles the spec with the code that exists and lists every conflict instead of picking one silently.

---

## 1. Findings (what exists today)

**Backend (`backend/`, Express 5, ESM, zod 4, `pg`, node-pg-migrate)**
- Every route is mounted under `/api/v1` ([index.ts](backend/src/index.ts), [routes/index.ts](backend/src/routes/index.ts)).
- Auth routes ([auth.ts](backend/src/routes/auth.ts)):
  - `POST /api/v1/auth/send-code`, body `{ phone }` (E.164 regex), returns `{ status: "sent" }`.
  - `POST /api/v1/auth/verify-code`, body `{ phone, code }` (6 digits), returns `{ token }`. It upserts `customers` with `phone_verified = true`. It does **not** set `name`.
  - Errors: `invalid_code` (400) and `too_many_attempts` (429).
- JWT ([jwt.ts](backend/src/lib/jwt.ts)):
  - The payload is `{ customerId: number }` only. **There is no phone in the token.**
  - Expiry is **15m**, which ADR-001 (Accepted) set on purpose.
- [requireVerifiedPhone.ts](backend/src/middleware/requireVerifiedPhone.ts) sets `req.customer.customerId` and returns 401 with `unauthorized`.
- `POST /api/v1/orders` **already exists** ([orders.ts](backend/src/routes/orders.ts)):
  - It already recomputes the total from the database and rejects unknown or unavailable items.
  - It takes `{ fulfillmentType, requestedTime?, paymentMethod, items: [{ menuItemId, quantity, notes? }] }` and returns `201 { orderId, totalCents }`.
  - It has no idempotency, no length limit on notes, no customer name, and no CORS.
- Error shape: `{ error: { code, message } }`, built with `AppError` and the ZodError mapping ([errorHandler.ts](backend/src/middleware/errorHandler.ts)). This matches the coding standards.
- `GET /menu` and `GET /orders/:id` **do not exist**.
- Schema ([01_init-core-schema.ts](backend/migrations/01_init-core-schema.ts)):
  - `menu_items(id, name, description, price_cents, image_url, category text, is_available, ...)`. There is no `is_active`, no `price`, and **no `display_order`**.
  - `orders.requested_time` is nullable. Status values are `created`, `confirmed`, `preparing`, `ready`, `picked_up`, `no_show`, `cancelled`.
- **Uncommitted backend work** (in the working tree, not committed yet):
  - `backend/migrations/03_menu_display.ts` adds `display_order` (default 0), `available_from time` (null means available all day), and `UNIQUE (category, name)`.
  - `backend/scripts/seed-menu.ts` (run with `npm run seed:menu`, which accepts `--dry-run`) upserts **55 items, not 35**, keyed on `(category, name)`.
    - Its categories are `Burritos`, `Montadas`, `Desayunos`, `Después de las 2 PM`, and `Extras`. The spec's "Burritos Pa' la Comida" category is not in it.
    - `display_order` **restarts per category** (10, 20, …).
    - The 6 "Después de las 2 PM" items have `available_from = '14:00'`.
    - Prices are converted from pesos ×100 into centavos.
    - **Discada is priced** (burrito $65, montada $80), so the spec's "Discada has no price" no longer holds.
    - Items that are no longer on the board are set to `is_available = false`, never deleted.

**Live database (Supabase, checked on 2026-10-28)**
- `pgmigrations` shows `01`, `02`, and **`03_menu_display` were applied** (03 ran today). The live schema matches the repo plus 03.
- **The seed has not been run.** `menu_items` holds **5 hand-entered rows** with bad data:
  - Prices are stored as pesos in a centavos column: `55` means $0.55.
  - The category is spelled three ways: `Burritos`, `Burrito`, and `Burrito ` (with a trailing space).
  - Every `display_order` is 0, and one name drops the accent (`Huevo con Jamon` instead of `Huevo con jamón`).
  - No order items reference these rows: `orders`, `order_items`, and `customers` are all empty.
- **⚠ Critical: Row Level Security is disabled on all 7 public tables.** Anyone with the project's anon key can use the Supabase Data API to read or modify every row. That includes customer phone numbers and the OTP hashes in `otp_codes`. The backend connects directly through `DATABASE_URL` as the table owner, which bypasses RLS. So turning RLS on with no policies closes the gap without affecting the backend (see Open Question 17).
- There's no test runner, and the backend `test` script is a stub.
- Env validation is in [env.ts](backend/src/config/env.ts). `STRIPE_SECRET_KEY` is required even though nothing uses Stripe yet.

**Frontend (`frontend/`)**
- Next **16.3.2** and React 19.2, using the `src/` layout with the `@/*` → `./src/*` alias. `next.config.ts` is empty, so `cacheComponents` is off and the classic `export const revalidate = 60` ISR applies (confirmed in `node_modules/next/dist/docs/01-app/02-guides/incremental-static-regeneration.md`).
- In Next 16, dynamic `params` is a `Promise`, and the typed `PageProps<'/orders/[id]'>` and `LayoutProps` helpers exist.
- Tailwind is being moved from v4 to v3.4 in the working tree. The uncommitted changes touch `package.json`, `postcss.config.mjs`, `globals.css`, and the new `tailwind.config.ts`. They match the v3 guide in the Next docs.
- The PWA manifest comes from `app/manifest.ts` (`MetadataRoute.Manifest`).

---

## 2. Open Questions (each has my recommendation; edit any you disagree with)

1. **Endpoint names.** The spec uses `/auth/otp/send`, `/auth/otp/verify`, `/menu`, and `/orders`. The code uses `/api/v1/auth/send-code` and `/api/v1/auth/verify-code`.
   → **Keep the existing backend routes.** Versioning is required by coding_standards §5. New routes become `/api/v1/menu` and `/api/v1/orders/:id`.
2. **JWT expiry conflicts with an Accepted ADR.** ADR-002 and the spec want about 24h, but ADR-001 chose 15m. With 15m, the `/orders/[id]` polling page starts returning 401 fifteen minutes after ordering, which is before most orders are ready.
   → **Change the expiry to 24h and mark ADR-001's expiry clause "Superseded by ADR-002"** (an edit to ADR-001's status and a note), rather than silently changing it.
3. **The JWT has no phone.** The spec says to check "belongs to the JWT's phone number."
   → **Check ownership by `customerId`.** It's equivalent, because there is one customer per phone. `AuthContext.phone` comes from what the user typed at checkout.
4. **Column names in the spec vs. the schema.** The spec uses `is_active` and `price`; the schema has `is_available` and `price_cents`. The spec says "MXN integers," while the schema and coding_standards §3 use centavos.
   → **Use the existing columns.** The menu filter becomes `is_available AND price_cents > 0`. `formatMXN(cents)` takes centavos.
5. **Category order.** `display_order` already exists through migration 03, but it restarts within each category, so nothing in the database orders the categories themselves.
   → **Move the seed's `Category` union into `backend/src/lib/menuCategories.ts` as `MENU_CATEGORY_ORDER`.** Both `seed-menu.ts` and `GET /menu` import it, so there's one source of truth. The query sorts by the category's index in that list, then `display_order`, then `id`. Any category not in the list sorts last.
6. **Seed vs. spec.** The seed has 55 items, the "Después de las 2 PM" category, and a price for Discada. The spec says 35 items, "Burritos Pa' la Comida", and an unpriced Discada.
   → **Treat the seed as the truth.** Commit `03_menu_display.ts` and `seed-menu.ts` in slice 1. Before running the seed, **delete the 5 hand-entered rows** (nothing references them). Otherwise the seed only marks them unavailable, and they stay in the table with prices 100× too low. The `price_cents > 0` filter stays as a safety net.
7. **Customer name.** Checkout collects a name, but nothing stores it.
   → **Add an optional `customerName` (1–60 characters) to `POST /orders`, and write it to `customers.name` in the same transaction.** Pickup matching uses name plus the last 4 digits of the phone (architecture §4.7).
8. **Payment method.** The existing endpoint accepts `card`, `oxxo`, and `bank_transfer`, but none of them are wired up.
   → **Have the server reject anything except `cash` for now** with `payment_method_unavailable`, so nobody can create card orders that stay unpaid forever.
9. **Capacity check.** Architecture §4.3 and §5 require a `capacity_slots` `FOR UPDATE` check on every order, but the spec doesn't mention it.
   → **Out of scope for this MVP.** It should be its own PR with an ADR, because slots aren't defined yet. Flagged here so it isn't forgotten. Optionally, I can reject `is_blocked` customers now, since that's one line.
10. **Pickup hours and timezone.** The spec doesn't give the shop's hours or its timezone (Tijuana, Juárez, or somewhere else).
    → **Hours: Monday–Saturday, 7:30 AM to 3:30 PM, closed Sunday.** The timezone is `America/Ciudad_Juarez`.
    - Both values live in one place, `backend/src/lib/shopHours.ts`, as `SHOP_TIMEZONE` and `SHOP_HOURS`. Days are numbered 1–6 for Monday–Saturday, with `open: '07:30'` and `close: '15:30'`.
    - `GET /menu` returns them as `shop: { timezone, hours }`, so the frontend never keeps its own copy that could drift.
    - Scheduled pickup is today only, in 15-minute steps. The earliest slot is at least 30 minutes from now and no earlier than 07:30, and the last slot is 15:30.
    - ASAP is only offered while the shop is open.
    - When the shop is closed (Sunday, before 7:30, or after 3:30), checkout shows "Estamos cerrados" with the next opening time, and the order button is disabled.
    - The server rejects any pickup time outside the hours, or in the past, with `shop_closed` or `invalid_pickup_time`.
11. **What a 401 should do on `/orders/[id]`.** The spec says to send the user back to `/checkout`, but the cart is already empty after an order, so that would be a dead end.
    → **On the order page only, show "Verifica tu número para ver tu pedido" with a link to `/checkout`.** Everywhere else, follow the spec.
12. **Folder layout.** The spec shows `frontend/app/...`, but the scaffold uses `frontend/src/app/...`.
    → **Keep `src/`**, so all paths below are under `frontend/src/`.
13. **Tests.** coding_standards §8 requires unit tests for price calculation, and integration tests for the order flow.
    → **Add Vitest to both packages.** It covers unit tests for `phone`, `money`, `cartReducer`, `pickup`, and the backend `computeOrderTotal`. A DB-backed integration test of the order flow needs a test database, so I'll ask before setting one up.
14. **Nothing moves an order past `created` yet,** because there's no kitchen screen. The order page will show "Recibido" until a status is changed by hand in the database. That's acceptable for the MVP.
15. **`POST /auth/send-code` has no rate limit.** Repeated sends cost money. *Resolved by ADR-003:* Twilio Verify enforces send rate limits and fraud protection.
16. **File name.** The ADR file is `docs/adr/002-frontend-architecture` and has no `.md`.
    → I'll rename it to `.md` in slice 1 unless you'd rather keep it.
17. **⚠ RLS is disabled on every table.**
    → **Before slice 1,** add a migration (`04_enable-rls.ts`) that runs `ALTER TABLE … ENABLE ROW LEVEL SECURITY` on all 7 tables, with **no policies**. Nothing goes through the Data API, and the backend connects as the table owner, so it isn't affected. I'll check the role in `DATABASE_URL` first and confirm the backend still works. **I won't apply it until you approve.** The SQL:
    ```sql
    ALTER TABLE public.pgmigrations   ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.customers      ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.menu_items     ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.capacity_slots ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.orders         ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.order_items    ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.otp_codes      ENABLE ROW LEVEL SECURITY;
    ```
18. **`available_from` (items sold only after 2 PM).** The spec doesn't cover it, but the server is authoritative, so it has to be enforced there.
    → **`GET /menu` returns `availableFrom` for every item**, and the item card shows a "Disponible después de las 2 PM" badge.
    - The add-to-cart button stays enabled.
    - If the cart contains such an item, `PickupTimePicker` hides ASAP before 14:00 and only offers slots at or after 14:00.
    - `POST /orders` rejects an order with `item_not_available_yet` when the effective pickup time (`requested_time`, or now for ASAP) in `SHOP_TIMEZONE` is earlier than `available_from`. Postgres does the comparison, with `(COALESCE($t, now()) AT TIME ZONE $tz)::time >= available_from`.
    - **This needs the shop's timezone** (Open Question 10).

---

### Decided (2026-10-28)
- **Open Question 17, RLS:** first, a `04_enable-rls.ts` migration (slice 0). Before applying it, I check the role in `DATABASE_URL`. After applying it, I verify that `/health` and an OTP send still work.
- **Open Question 6, the 5 hand-entered rows:** delete them, then run the seed with `--dry-run`, then run it for real.
- **Open Question 10, timezone:** `SHOP_TIMEZONE = "America/Ciudad_Juarez"`. Hours are Monday–Saturday, 07:30–15:30, closed Sunday (decided 2026-10-28). That leaves "Después de las 2 PM" items orderable only from 14:00 to 15:30.
- **Same-day pickup only (decided 2026-10-28).** There is no ordering ahead for the next open day. On Sunday, and from 3:30 PM until 7:30 AM, the app shows "Estamos cerrados" and doesn't take orders. Revisit if after-hours demand shows up.
- **WhatsApp codes, no SMS (decided 2026-10-29, ADR-003).** Codes are sent by Twilio Verify with `channel=whatsapp` only. Verify's SMS fallback is an account-level pilot that has to be requested from Twilio, so by default no SMS is sent. Customers without WhatsApp can't order online.
  - Verify replaces our own code generation, so the `otp_codes` table, the hashing, `OTP_EXPIRY_MINUTES`, and `OTP_MAX_ATTEMPTS` all go away.
  - **Before launch:** Meta business verification, a WhatsApp sender, and that sender attached to the Verify service.
- **No status messages; the live status page is the notification (decided 2026-10-29).** The page polls every 15 s. When the status becomes `ready`, it shows a large "¡Tu pedido está listo!" banner, changes the tab title, and calls `navigator.vibrate` if the page is open. It doesn't use browser notification permission.
- **Open Question 2, JWT expiry:** `VERIFIED_PHONE_TOKEN_EXPIRY = "24h"`. ADR-001 gets a note that its expiry clause is superseded by ADR-002.

## 3. Slices

### Slice 0: Lock down the database
- `backend/migrations/04_enable-rls.ts` contains the SQL from Open Question 17. Its down migration disables RLS again.
- Acceptance criteria:
  - The Supabase advisor no longer reports `rls_disabled`.
  - The backend still serves `/api/v1/health` and can send an OTP.

### Slice 1: Foundation and menu

**Backend**
- Commit the existing `03_menu_display.ts` and `scripts/seed-menu.ts`.
  - `seed-menu.ts` now imports `MenuCategory` and `MENU_CATEGORY_ORDER` from `src/lib/menuCategories.ts`.
- Data cleanup, run only after your OK: `DELETE FROM menu_items WHERE id IN (1,2,3,4,5)`. Then run `npm run seed:menu -- --dry-run`, and then `npm run seed:menu`.
- `backend/src/routes/menu.ts`: `GET /api/v1/menu`.
  - Query: `SELECT id, name, description, price_cents, image_url, category, available_from FROM menu_items WHERE is_available AND price_cents > 0 ORDER BY array_position($1::text[], category) NULLS LAST, display_order, id`, with `$1` set to `MENU_CATEGORY_ORDER`.
  - Response: `{ shop: { timezone, hours }, categories: [{ name, items: [{ id, name, description, priceCents, imageUrl, availableFrom }] }] }`. `availableFrom` is `"HH:MM"` or `null`, and `hours` comes from `backend/src/lib/shopHours.ts`.
  - Mounted in [routes/index.ts](backend/src/routes/index.ts).
- CORS: add the `cors` dependency and `CORS_ORIGINS` to `env.ts` (a comma-separated list), and apply it in `index.ts`. Allowed headers: `Content-Type`, `Authorization`, `Idempotency-Key`.

**Frontend**
- `src/types/menu.ts`: `MenuItem`, `MenuCategory`, `MenuResponse`.
- `src/lib/api.ts`:
  - `apiFetch<T>(path, { method, body, auth?, headers? }): Promise<T>`.
  - It throws `ApiError { status, code, message }` and maps network failure to `code: "network_error"`.
  - It reads `NEXT_PUBLIC_API_BASE_URL` (the bare API origin) and appends `/api/v1`.
  - `setUnauthorizedHandler(fn)` lets `AuthProvider` register what a 401 does.
  - It also exports typed wrappers, starting with `getMenu()`.
  - This is the only file that calls `fetch`.
- `src/lib/money.ts`: `formatMXN(cents: number): string`. It uses `Intl.NumberFormat('es-MX', { currency: 'MXN' })` and shows no decimals when the amount is a whole peso.
- `src/lib/strings.ts`: `export const strings = { menu: {...}, cart: {...}, ... } as const`, in Spanish.
- `src/app/layout.tsx`: set `lang="es"` and real metadata.
- `src/app/page.tsx`: a server component with `export const revalidate = 60` that calls `getMenu()`. It renders `components/menu/CategorySection.tsx` and `MenuItemCard.tsx`, read-only.
- `src/app/error.tsx`: a minimal error page shown when the menu fetch fails.
- Vitest setup, with `money.test.ts`.

**Acceptance criteria**
- `curl localhost:4000/api/v1/menu` returns 55 items in 5 categories, in the board's order, and the old 5 rows are gone.
- `npm run dev` in `frontend/` shows the menu by category with prices like `$85`.
- Stopping the API and loading the page shows the error page, not a crash.

**Risk:** `next build` prerenders the menu, so the API must be reachable at build time on Vercel. If it isn't, the build fails. That's acceptable, but the API has to be deployed first.

### Slice 2: Cart

**Files**
- `src/context/CartContext.tsx`:
  - `CartLine { menuItemId: number; name: string; unitPriceCents: number; quantity: number; note: string }`.
  - Reducer actions: `add`, `setQuantity`, `setNote`, `remove`, `clear`.
  - The pure `cartReducer` is exported so it can be tested.
  - Persistence: the cart is saved to `localStorage` key `elpesado.cart.v1` with a try/catch around every access. It's loaded after mount, so the server and client render the same thing.
  - Lines are keyed by `menuItemId`.
  - `useCart()` exposes `lines`, `itemCount`, `subtotalCents`, and the action functions.
- Components:
  - `components/menu/AddToCartButton.tsx` is a client component dropped into the server card.
  - `components/cart/CartLine.tsx` has a quantity stepper and a note field with `maxLength=140` and a character counter.
  - `CartSummary.tsx` shows the subtotal.
  - `CartBar.tsx` is a sticky bottom bar reading "Ver carrito (3) · $240", hidden when the cart is empty.
- `src/app/cart/page.tsx`, with an empty-cart state.
- `src/app/layout.tsx` wraps the app in `CartProvider`.
- `cartReducer.test.ts`.

**Acceptance criteria**
- Add items, then refresh or kill the tab: the cart survives.
- Editing a quantity or note works, and setting a quantity to 0 removes the line.
- With `localStorage` blocked (a private window in Safari), the app still works with an in-memory cart.

### Slice 3: Checkout form

**Files**
- `src/lib/phone.ts`:
  - `normalizePhone(input: string, country: 'MX' | 'US'): string | null`.
  - It strips every non-digit character. It accepts a 10-digit national number, or one that already carries the country code (`52…`, `1…`). It returns E.164, or `null` if the number isn't valid.
  - `maskPhone(e164)` returns `•••• 1234`.
- `src/lib/pickup.ts`:
  - `getScheduledSlots(now: Date, shop: ShopHours): Date[]` and `isOpenNow(now, shop)`. They read the hours that `GET /menu` returns, so nothing is hard-coded in the frontend.
  - `type Pickup = { kind: 'asap' } | { kind: 'scheduled'; time: string }`.
- `src/lib/checkoutDraft.ts`:
  - The `sessionStorage` draft `{ name, phone, pickup, idempotencyKey }`.
  - `getOrCreateDraft()` and `clearDraft()`.
- Components:
  - `components/checkout/PhoneInput.tsx` has a `+52 | +1` toggle (default `+52`) and uses `inputMode="tel"`.
  - `PickupTimePicker.tsx` offers ASAP or a list of slots.
- `src/app/checkout/page.tsx`:
  - Validates the form, calls `sendCode(phone)`, then `router.push('/checkout/verify')`.
  - Disables the button while the request is in flight.
  - If the cart is empty, it redirects to `/cart`.
- `src/context/AuthContext.tsx`:
  - Holds `{ token, phone, setToken, clear }` in `localStorage` key `elpesado.auth.v1`.
  - Registers the 401 handler: clear auth, then `router.push('/checkout')`. The cart is left untouched.
- Tests: `phone.test.ts` and `pickup.test.ts`.

**Acceptance criteria**
- Entering `664 123 4567` with MX selected produces `+526641234567`, and the code arrives on WhatsApp (after the slice 4 switch to Verify).
- A US number works with `+1`.
- An invalid number shows an inline error, and nothing is sent.

### Slice 4: Verify and create the order

**Backend**
- **Switch auth to Twilio Verify over WhatsApp (ADR-003).** The paths and response shapes stay the same, so the frontend doesn't change.
  - `POST /auth/send-code` calls `client.verify.v2.services(TWILIO_VERIFY_SERVICE_SID).verifications.create({ to, channel: "whatsapp" })`.
  - `POST /auth/verify-code` calls `verificationChecks.create({ to, code })`.
    - On `status === "approved"`, it upserts the customer and issues the JWT, as today.
    - Any other status returns `invalid_code` (400).
  - Twilio error mapping:
    - too many check attempts → `too_many_attempts` (429)
    - too many send attempts → `too_many_requests` (429)
    - verification not found or expired → `invalid_code`
    - invalid number → `validation_error`
    - anything else → `internal_error`, logged with the phone masked
  - JWT expiry goes from `15m` to `24h` (Open Question 2).
  - Env: add `TWILIO_VERIFY_SERVICE_SID`, and remove `TWILIO_PHONE_NUMBER`, `OTP_EXPIRY_MINUTES`, and `OTP_MAX_ATTEMPTS`.
  - The Verify service must be configured for 6-digit codes, to match the existing validation.
  - `backend/migrations/06_drop-otp-codes.ts` drops `otp_codes`, which is empty. Its down migration recreates the table as in `02`.
- `backend/migrations/05_order-idempotency.ts` (04 is the RLS migration):
  ```sql
  ALTER TABLE orders ADD COLUMN idempotency_key uuid;
  CREATE UNIQUE INDEX orders_customer_idempotency_key_uniq
    ON orders (customer_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
  ```
- `backend/src/lib/pricing.ts`:
  - `computeOrderTotal(items, menuItemsById): number`, extracted from `orders.ts`, with unit tests.
- Changes to `orders.ts` `POST /`:
  - Require the `Idempotency-Key` header and validate it as a UUID with zod.
  - Inside the transaction, first `SELECT id ... WHERE customer_id=$1 AND idempotency_key=$2`. If a row is found, return `200` with that order.
  - Otherwise insert. A unique violation (`23505`) from a concurrent duplicate means another request won: roll back, re-select, and return `200` with that order.
  - New orders return `201` with the same order shape that `GET` returns.
  - Validation changes:
    - Notes are limited to 140 characters.
    - Quantity must be ≤ 20.
    - `paymentMethod` must be `cash` (Open Question 8).
    - `requestedTime` must be in the future, and must be absent for ASAP orders.
    - The pickup time must fall within `SHOP_HOURS`. For ASAP orders, that means the order is placed while the shop is open. Otherwise the server returns `shop_closed`.
    - `customerName` is optional (Open Question 7).
    - Duplicate `menuItemId` lines are rejected.
  - Log the `created` state transition as structured JSON with the order id and the masked phone.

**Frontend**
- `src/types/order.ts`: `Order`, `OrderStatus`, `CreateOrderRequest`.
- `src/components/checkout/OtpInput.tsx`: 6 digits, `inputMode="numeric"`, and `autoComplete="one-time-code"`. The code arrives on WhatsApp, whose copy-code button puts it on the clipboard, so the input accepts a paste and strips anything that isn't a digit. Copy: "Te enviamos un código por WhatsApp al •••• 4567".
- `src/app/checkout/verify/page.tsx`:
  1. Call `verifyCode`, then `setToken`.
  2. Call `createOrder(cart, draft)` with the draft's idempotency key.
  3. On success, clear the cart and the draft, then `router.replace('/orders/' + id)`.
  - If `createOrder` fails after verification, show a retry button that reuses the same token and key, so no new OTP is needed.
  - The verify page also has a "Reenviar código" (resend code) link.

**Acceptance criteria**
- The full flow creates exactly one order, even after a double tap, and even if the "network drops" (simulated by re-sending the same request in DevTools).
- Changing `unitPrice` in `localStorage` does not change the server total.
- Back from the order page does not resubmit.

### Slice 5: Confirmation

**Backend**
- `GET /api/v1/orders/:id`, behind `requireVerifiedPhone`, with `WHERE id=$1 AND customer_id=$2`.
  - It returns **404, not 403**, when the order isn't the caller's, so callers can't learn which order ids exist.
  - Response shape: `{ id, status, fulfillmentType, requestedTime, estimatedReadyAt, paymentMethod, paymentStatus, totalCents, createdAt, customerName, phoneLast4, items: [{ menuItemId, name, quantity, priceAtOrderCents, notes }] }`.

**Frontend**
- `src/app/orders/[id]/page.tsx` is a client component that gets the id with `useParams`.
- It polls `getOrder` every 15 s and pauses when the tab is hidden (`visibilitychange`).
- It stops polling at the terminal statuses `picked_up`, `no_show`, and `cancelled`.
- **Ready alert:** when a poll first sees `ready`, the page:
  - shows a full-width "¡Tu pedido está listo!" banner;
  - sets `document.title` to "✅ ¡Listo! · Burritos El Pesado";
  - calls `navigator.vibrate([200, 100, 200])` where supported (iOS Safari doesn't support it, so it's skipped there).
  - It fires only on the transition, not on every poll, and not if the page first loads with the order already ready.
- The page keeps a visible "Mantén esta página abierta para saber cuándo esté listo" hint until the order is ready.
- It shows the status in Spanish, the items, the total, the pickup time, and "Paga en efectivo al recoger" ("pay cash at pickup").

**Acceptance criteria**
- Changing `status` in the database shows up in the UI within 15 s.
- Requesting another customer's order id returns 404.

### Slice 6: Polish

- `src/app/manifest.ts`, plus icons in `public/icons/`. **I need the logo; until then I'll use placeholders.**
- `loading.tsx` for `/`, and loading and empty states on every page.
- Every tap target is at least 44px (`min-h-11`), and the layout is checked at 360px wide.
- High-contrast colors.
- The `CartBar` doesn't cover the content (bottom padding plus `env(safe-area-inset-bottom)`).
- Update ADR-002's Implementation Notes and set its status to Accepted.

---

## 4. Environment variables

| Where | Var | Notes |
|---|---|---|
| frontend `.env` | `NEXT_PUBLIC_API_BASE_URL` | API origin only, e.g. `http://localhost:4000`. Inlined at build time, so set it in Vercel before building. |
| backend `.env` | `CORS_ORIGINS` | **new**, e.g. `http://localhost:3000,https://<vercel-app>` |
| backend `.env` | `TWILIO_VERIFY_SERVICE_SID` | **new in slice 4**, the Verify service with the WhatsApp sender attached. `TWILIO_PHONE_NUMBER` and `OTP_*` are removed. |
| backend `.env` | existing: `DATABASE_URL`, `JWT_SECRET`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `STRIPE_SECRET_KEY` | `STRIPE_SECRET_KEY` is still required; any placeholder value works for local dev |

## 5. Deviations from the spec

- **Paths:** the frontend uses `src/` (Open Question 12), and the API uses the existing `/api/v1/auth/send-code` and `verify-code` routes (Open Question 1).
- **Idempotency key:** it's generated **once per checkout draft**, stored in `sessionStorage`, and cleared on success, instead of on each mount of the checkout page. Otherwise, going back from verify to checkout would create a new key and could produce a duplicate order.
- **Prices:** prices are in centavos (`priceCents` and `formatMXN(cents)`), following the schema and coding_standards §3.
- **Ownership:** order ownership is checked by `customerId`, not phone (Open Question 3).
- **401 on `/orders/[id]`:** the order page shows a re-verify prompt instead of redirecting (Open Question 11).
- **Additions:** CORS was added, and it isn't in the spec. The API couldn't be called from the browser without it.
- **Found during slice 1:**
  - **API env var:** the frontend uses the existing `NEXT_PUBLIC_API_BASE_URL`, which holds the origin only, instead of the spec's `NEXT_PUBLIC_API_URL`.
  - **Menu response:** `GET /menu` also returns `shop: { timezone, hours }`, so the pickup rules have one source.
  - **Error page:** Next 16's `error.tsx` receives `retry()`; the older `reset()` no longer exists.
  - **Backend typecheck:** `scripts/` is excluded from the build tsconfig because it sits outside `rootDir`, and the new `tsconfig.scripts.json` typechecks it. `npm run typecheck` runs both.
  - **Frontend Node types:** `@types/node` went from `^20` to `^24`, to match the Node 24 runtime and satisfy Vitest 5's peer requirement.
  - **Menu images:** not rendered yet, because every `image_url` is null. Showing R2 photos will need `images.remotePatterns` in `next.config.ts`.
  - **Error page when the API is down:** in production, the ISR page keeps serving the last good menu, so `error.tsx` only appears on a cold cache or in dev.
- **Found during slice 2:**
  - **Category on cart lines:** `CartLine` also stores `categoryName`. 17 names appear in both Burritos and Montadas (for example "Frijoles con queso"). Without the category, two lines would look identical in the cart, and their screen-reader labels would be the same. Lines are still keyed by `menuItemId` only.
  - **Pure cart logic:** the reducer and storage parsing live in `context/cartReducer.ts` and `context/cartStorage.ts`, so they can be tested without React. `CartContext.tsx` is the thin React wrapper around them.
  - **Quantity cap:** each line is capped at 20 (`MAX_QUANTITY_PER_LINE`), the same limit the server will enforce in slice 4.
- **Found during slice 3:**
  - **Fresh menu at checkout:** `/checkout` fetches `GET /menu` in the browser. That gives it the shop hours and each item's `availableFrom` (the cart doesn't store them), and lets it list cart items that were taken off the menu. The submit button stays disabled until those items are removed.
  - **Closed hours:** the form isn't shown while the shop is closed, which includes before 7:30 AM. Following the "same-day only, no orders 3:30 PM–7:30 AM" decision, nobody can schedule a 7:30 pickup at 6 AM.
  - **Shop time, not device time:** all pickup times are computed in `America/Ciudad_Juarez`, whatever the device's timezone is. This was tested with a browser set to Los Angeles time.
  - **UUID fallback:** `lib/uuid.ts` falls back to `crypto.getRandomValues` when `crypto.randomUUID` isn't available. `randomUUID` needs HTTPS or localhost, so testing from a phone over plain HTTP on the LAN would otherwise break.
  - **Add button waits for the cart:** "Agregar" is disabled until the saved cart has loaded. Before that, a tap was either lost (handlers not attached yet) or overwritten when the saved cart loaded.
  - **ASAP near closing:** ASAP is allowed until 3:29 PM, so an order placed at 3:29 would be ready after closing. *Open: should there be a last-order cutoff?*
- **Found during slice 4:**
  - **2 PM check in code, not SQL:** the `available_from` rule runs in `backend/src/lib/pickupRules.ts` (unit tested) instead of the Postgres comparison sketched in Open Question 18. Same rule, easier to test.
  - **Orders only while open:** the server accepts orders only while the shop is open, including scheduled ones. This matches the frontend.
  - **New error codes:**
    - `shop_closed` (409), `invalid_pickup_time` (400), `item_not_available_yet` (409)
    - `payment_method_unavailable` (400)
    - `too_many_requests` (429, Verify's send limits or fraud protection)
    - `verification_unavailable` (502, any other Twilio failure, logged by Twilio error code only so no phone number appears)
  - **Retries before closing-time checks:** an `Idempotency-Key` that was already used returns its order (200) before the hours check runs. A retry that arrives after closing still gets the order instead of `shop_closed`.
  - **Category in order lines:** order lines in responses include `categoryName`, because names repeat across categories.
  - **Structured logging:** order creation is logged as structured JSON (`order_status_changed`, from `null` to `created`) with the phone masked to `***1234` (`backend/src/lib/log.ts`).
  - **Tests:** `backend/src/app.ts` now builds the Express app and `index.ts` only starts it, so tests can run the app without a port.
    - `npm run test:integration` runs `orders.integration.test.ts` against `DATABASE_URL`, with Twilio mocked. It creates its own customer and orders and deletes them afterwards.
    - `npm test` runs unit tests only.
  - **Retry keeps the token:** after a successful code, a failed order can be retried with the same token and idempotency key, without a new code.
  - **Not done:** blocked customers (`is_blocked`) are still not rejected (Open Question 9, optional).
  - **Resolved (2026-11-04):** a returning customer within 24 hours skips the code (see slice 5 below).
- **Found during slice 5:**
  - **Skipping the code:** when the stored login belongs to the same phone and has at least 10 minutes left, checkout doesn't send a code and the verify page shows only "Confirmar pedido" (`frontend/src/lib/jwt.ts` reads the expiry; the server still verifies the token). The phone field is prefilled from the stored login. If the server rejects the token anyway, the app-wide 401 handler clears it and returns the customer to `/checkout`, and the next submit sends a code.
  - **Shop-local pickup time:** order responses include `requestedClockTime` ("14:15" in shop time), so the status page doesn't need the shop's timezone.
  - **401 on the status page (changes Open Question 11):** a 401 or a missing login shows "No podemos mostrar tu pedido aquí", which tells the customer to open the page on the phone they ordered from or give their name and last 4 digits at pickup. A link to `/checkout` would be a dead end, because the cart is empty after ordering. `getOrder` opts out of the app-wide 401 redirect.
  - **Polling details:** an invalid order id (a 400 from the server) is shown as not found. When a poll fails, the last status stays on screen with a "Sin conexión" notice.
  - **Progress bar:** the status page shows 4 steps (Recibido, Preparando, Listo, Entregado). `confirmed` counts as Recibido. `no_show` and `cancelled` show no progress bar.

- **Found during slice 6:**
  - **PWA:** `app/manifest.ts` serves the manifest (Spanish name, short name "El Pesado", `standalone`, portrait, theme color `#b91c1c`). `layout.tsx` adds `viewport` (theme color, `viewportFit: "cover"` so the cart bar's safe-area padding works on iPhones; zoom stays enabled) and `appleWebApp` and Apple touch icon metadata for iOS home-screen installs. There's no service worker or offline mode, which is out of scope.
  - **Placeholder icons:** `public/icons/` (192, 512, maskable 512, Apple 180) are rendered from `placeholder-icon.svg` (red square, "EP"). Replace the PNGs with the real logo at the same sizes and file names.
  - **Spanish fallback pages:** a 404 page (`app/not-found.tsx`) and a loading state (`app/loading.tsx`, which honors reduced-motion).
  - **Audit:** every page state at 360px, light and dark, was checked for overflow, tap targets under 44px, and axe-core WCAG 2.1 AA. It found and fixed the "Cambiar número" link (24px tall) and dark-mode `text-zinc-500` small text (3.7–4.1:1 contrast, now `dark:text-zinc-400`). The re-audit found 0 issues.
  - **Brand color:** it lives in `lib/theme.ts` (`BRAND_COLOR`) rather than in the copy file.

## 6. Verification (overall)

- Each slice has its own acceptance criteria and passes `npm run lint`, `npx tsc --noEmit`, and `npx vitest run` in each package it touches.
- After slice 5, an end-to-end pass on a real phone over cellular data: browse, add 3 items with a note, check out with ASAP, enter the OTP from WhatsApp, then see the confirmation, change the order status in the database, and watch the page update.
- Commits follow imperative messages on `frontend-customer-flow`. Schema and backend changes stay in their own commits.
