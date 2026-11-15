# ADR-004: Customer ordering screens rebuilt to the El Pesado design

**Status:** Proposed

**Date:** 2026-11-06

**Deciders:** Noel Lozano

## Context

The customer flow (Menu → Cart → Checkout → OTP → Status) shipped in PR #1 under
ADR-002. It works, but it uses a placeholder look: Geist, zinc/red Tailwind
classes and `dark:` variants. We now have a visual spec in `design/` with six mobile
mockups (390×844) and one desktop reference (≥1024 px). The spec defines a brand
palette, a type pair, hard-offset shadows and some new UI:

- an item detail screen with a Burrito / Montada choice,
- category chips and search,
- a bottom tab bar (Menú / Pedidos / Cuenta),
- a pickup card on the cart screen,
- a one-screen checkout,
- a six-box OTP input,
- a confirmation hero with a status tracker.

Facts that constrain this decision:

- **Backend (unchanged by this ADR).** Every route is under `/api/v1`:
  - `GET /menu` returns `{ shop: { timezone, hours[] }, categories: [{ name, items: [{ id, name, description, priceCents, imageUrl, availableFrom }] }] }`. It hides items where `!is_available` or `price_cents = 0`.
  - `POST /auth/send-code` takes `{ phone }`. `POST /auth/verify-code` takes `{ phone, code }` and returns `{ token }` (a 24 h JWT in the response body).
  - `POST /orders` (Bearer token, `Idempotency-Key` header):
    - It recomputes prices from `menu_items` and stores `price_at_order_cents`.
    - It enforces shop hours (`409 shop_closed`, `400 invalid_pickup_time`) and `available_from` (`409 item_not_available_yet`).
    - It accepts only `paymentMethod: "cash"`.
    - It **rejects a request where the same `menuItemId` appears twice**.
  - `GET /orders/:id` (Bearer token, owner only).
- **The OTP channel is WhatsApp only** (ADR-003, `architecture.md` §2). Order
  status is never pushed by message; the status page polls (ADR-002 #9).
- **Database.** `menu_items` has `price_cents`, `image_url` (all null for now),
  `category`, `display_order` and `available_from`. Burritos and Montadas are
  **separate rows** that share a name ("Asado" in `Burritos` at $45 and in
  `Montadas` at $65). In `Después de las 2 PM` they are named
  "Burrito de X" / "Montada de X". There is no column marking an item as a drink.
- **Frontend stack.** Next 16.3 App Router, React 19, Tailwind **v3**
  (`tailwind.config.ts`), and Vitest with `.ts` unit tests only.
- **Users.** Students ordering one-handed on a phone between classes
  (`coding_standards.md` §11). UI copy is Spanish.

This ADR extends ADR-002 and does not replace it. Anything not mentioned here
still follows ADR-002.

## Decision

We will restyle the existing customer flow **in place** to match `design/`. We
keep the current routes, contexts, hooks and `lib/` helpers. We add one route
(`/item/[id]`), a small set of shared UI components, design tokens in the
Tailwind theme, and a pure `groupMenuItems()` helper that presents Burrito /
Montada rows as one product with a required choice. No backend changes are part
of this ADR. Anything the screens need that the API doesn't provide is listed
under **Gaps** and built against a typed client function marked `// TODO(api)`.

### 1. Routing and screen map

| # | Screen | Route | Status |
|---|---|---|---|
| 01 | Menú | `/` | Existing route, restyled |
| 02 | Detalle del producto | `/item/[id]` | **New** |
| 03 | Tu pedido | `/cart` | Existing route, restyled |
| 04 | Confirmar pedido (checkout) | `/checkout` | Existing route, restyled |
| 05 | Código de WhatsApp | `/checkout/verify` | Existing route, restyled |
| 06 | Pedido recibido / status | `/orders/[id]` | Existing route, restyled |

- **We keep `/orders/[id]`.** The handoff README and the build prompt plan
  `/order/[id]`, but ADR-002 #2 names `/orders/[id]`, the route already ships,
  and the 401 handler and polling hook use it. Renaming it would break any
  status link already sent to a customer, for no gain.
- **`/item/[id]` is a server component.** It reads the same ISR-cached
  `getMenu()` as `/` and looks up the item by ID. If the ID belongs to one half
  of a Burrito/Montada pair, the page opens with that variant preselected. No
  new endpoint is needed.
- **Category chips filter rather than scroll.** On `/`, the chips show one
  category at a time, as the mockups' state machine does. Search filters across
  all categories on the client and hides the chips while a query is active.
- **Tab bar.** It appears only on `/` and `/orders/[id]`, as in the mockups.
  The other screens have a back button and a fixed bottom action bar instead.
  The tabs are:
  - **Menú** goes to `/`.
  - **Pedidos** goes to the last order (see Gaps).
  - **Cuenta** shows the verified phone (masked) and "Cerrar sesión" (see Gaps).
- **Layout.** We design for 390 px first. At `lg` (≥1024 px), `/` and
  `/item/[id]` use the desktop mockup's layout:
  - a max-width 1200 px content column,
  - a menu grid (`minmax(250px, 1fr)`),
  - a sticky cart sidebar showing the same lines and a "Continuar" button that
    goes to `/checkout`.

  `/cart`, `/checkout`, `/checkout/verify` and `/orders/[id]` render as a
  centred column, max ~560 px, on desktop.
- **Where we differ from the desktop mockup.** It runs checkout, verify and
  done inside the sidebar. We keep real routes (ADR-002 #2) so the back button,
  refresh and deep links keep working.

### 2. Cart and auth state

- **Cart.** It stays as ADR-002 #4 describes: a pure `cartReducer`, a
  `CartContext`, and localStorage key `elpesado.cart.v1`. Two changes:
  - **The `add` action takes `quantity` and `note`**, so the detail screen can
    add "3 × Asado, sin cebolla" in one step.
  - **Lines stay keyed by `menuItemId` alone.** The build prompt suggested
    `menuItemId + notes`. We didn't do that because `POST /orders` rejects
    duplicate `menuItemId`s and the kitchen reads one note per line.
    - Adding an item that is already in the cart adds to its quantity.
    - If the new note is non-empty and differs from the existing one, it
      replaces it, and the user sees an inline notice
      ("Actualizamos las instrucciones de Asado").
- **Cart re-validation.** A new pure function, `reconcileCart(lines, menu)`,
  runs once the cart has loaded and the menu is known (on `/`, `/cart` and
  `/checkout`). It:
  - drops lines whose item is no longer in `GET /menu`,
  - refreshes names and prices,
  - returns the dropped names, which the UI shows once as a notice
    ("Ya no está disponible: …").

  The stored cart's version key stays `v1`, because the line shape doesn't
  change.
- **Auth.** The JWT stays in localStorage under `elpesado.auth.v1`, as ADR-002
  #6 decided. We restate the trade-off because the build prompt asked for it:
  - **Option A: memory plus an httpOnly cookie.** JavaScript can't read the
    token, so XSS can't steal it. The cost is that the frontend (Vercel) and the
    API (Railway or Render) are on different sites. The cookie would need
    `SameSite=None; Secure`, which some browsers block (Safari's ITP and other
    third-party cookie limits). It would also need CSRF protection and a backend
    change.
  - **Option B: localStorage (kept).** It works across sites today, and the
    "remembered device" check (`isTokenUsable`) is trivial. The risk is that any
    successful XSS can read the token. The impact is limited:
    - the token lasts 24 h,
    - it only exposes that phone's orders,
    - React escapes output,
    - the app loads no third-party scripts, and
    - menu text from the database is never rendered as HTML.
  - **Revisit when** the app and API share a registrable domain
    (`elpesado.com` / `api.elpesado.com`).
- **Checkout form state.** It lives in `/checkout` and is saved to the
  sessionStorage draft (`elpesado.checkout.v1`). That draft holds name,
  country, phone, pickup and the idempotency key. `/checkout/verify` reads only
  the E.164 phone and the draft it needs to build the order.

### 3. Burrito / Montada grouping (derived)

A pure, unit-tested `groupMenuItems(categories): MenuProduct[]` builds the list
of products from the menu response:

- It pairs `Burritos` ↔ `Montadas` items with exactly the same `name`.
- It pairs `Después de las 2 PM` items named `Burrito de X` ↔ `Montada de X`,
  using the same exact `X`.
- Every other item, or an item that has no partner, is a single product with no
  choice.

A paired product is listed **once**, in the burrito's category, at the burrito's
price. On `/item/[id]` it shows the required "¿Cómo lo quieres?" choice
(Burrito $45 / Montada · con queso gratinado $65). The `Montadas` category still
lists the montada-only rows. Paired montadas also stay visible there, so someone
browsing Montadas can still find them, and tapping one opens the detail with
Montada preselected. The cart always stores the concrete `menuItemId` of the
chosen variant.

This grouping is **derived from naming conventions**, not stored. If someone
renames a row in one category but not the other, the pair silently splits into
two plain products. The ordering still works; only the choice UI disappears.

### 4. Money and server price authority

- All amounts are integer centavos (`priceCents`) everywhere in state.
- They are formatted only at render, with the existing `formatMXN()`
  (`Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })`, which
  drops `.00`). The mockups show "$45" and "$185 MXN". The "MXN" suffix is added
  only on totals.
- The client total is **display-only**. `POST /orders` sends only
  `{ menuItemId, quantity, notes }`. The server recomputes everything and
  stores `price_at_order_cents` (ADR-002 #5).

### 5. Design tokens, fonts and images

- **Tokens.** Every token in `design/README.md` goes into
  `tailwind.config.ts → theme.extend`, and components use them by name. No raw
  hex values appear in components.
  - Colours: `navy`, `orange`, `yellow`, `red`, `paper`, `muted`, `line`, `cream`.
  - Radii: `rounded-sm` = 4px and `rounded` = 6px. We remove the larger
    radii and `rounded-full` from the theme so pill shapes can't creep back in.
  - A `shadow-hard` utility: `3px 3px 0 theme(navy)`.
  - The mockups use one more grey, `#8A7A6E`, for disabled borders. It is added
    as a `disabled` colour token.
- **No dark mode.** The design is light-only. We remove `darkMode: "media"` and
  every `dark:` variant.
- **Theme colour.** `BRAND_COLOR` (theme-color and manifest) becomes navy.
- **Fonts.** We use `next/font/google`: **Lilita One** (400) for headings and
  buttons, and **Nunito** (400–900) for body text. They are exposed as CSS
  variables and mapped to `font-display` and `font-sans`. Geist is removed.
- **Contrast rule.** Orange buttons always have navy text, which passes 4.5:1.
  White on orange is never used.
- **Images.** One `<MenuImage item size>` component handles every food image:
  - If `imageUrl` is set, it renders `next/image`. The image host is added to
    `images.remotePatterns` when one is chosen.
  - If not, it renders an emoji on a yellow box, with
    `aria-label="Foto pendiente"`. The emoji is 🥤 when the item is in `Extras`
    and its name is in an explicit `DRINK_NAMES` list (Agua, Kool-Aid, Té Brisk,
    Refresco 355 ml, Refresco 600 ml, Fuze Tea, Arizona, Jugos). Otherwise it is
    🌯.
  - When photos arrive, only the data changes.

### 6. Time-gated items (`available_from`)

- **Client.** Items with `availableFrom` show a "Desde 2 PM" badge, using
  `formatClockTime()`. Before that time in `America/Ciudad_Juarez`, judged by
  `useNow()` (ticks every 30 s, null on the server), the item can still be
  viewed. Its add button is `disabled` and the reason is shown next to it
  ("Disponible desde las 2 PM").
  - A scheduled pickup at or after the item's time is allowed. Checkout already
    restricts the time slots using `latestAvailableFrom()`.
  - On the server render, where `useNow()` is null, the button starts disabled
    and is enabled after hydration. This avoids a hydration mismatch.
- **Server.** This is **already enforced**. `assertItemsAvailableAt` in
  `backend/src/lib/pickupRules.ts` returns `409 item_not_available_yet`, and
  the UI maps that code to a Spanish message. It is not a gap.

### 7. Copy: WhatsApp, not SMS

The mockups say "SMS" in several places. The product sends codes only through
WhatsApp, and it sends no "ready" message. Wherever they disagree with the
mockups, the docs win:

| Mockup text | Shipped text |
|---|---|
| "Enviar código por SMS" | "Enviar código por WhatsApp" |
| "Te mandamos un código por SMS para confirmar." | "Te mandamos un código por WhatsApp para confirmar." |
| "Te mandamos 6 dígitos por SMS al …" | "Te mandamos 6 dígitos por WhatsApp al …" |
| "Solo te lo pedimos para confirmar el pedido y avisarte cuando esté listo." | "Solo te lo pedimos para confirmar tu pedido." |
| (06) "Te avisamos por SMS cuando esté listo para recoger." | "Deja esta página abierta: aquí verás cuando esté listo." |

The README name "05 · Código SMS" becomes "Código de WhatsApp". All copy stays in
`lib/strings.ts` (ADR-002 #10).

## Options considered

### Option A: Restyle in place, keep routes, derive the grouping (chosen)
- Pros:
  - Reuses tested code: the reducer, storage, JWT handling, phone and pickup
    helpers, polling, and 60 unit tests.
  - Needs no backend change and doesn't break existing links.
  - Each screen ships as one reviewable commit.
- Cons:
  - Existing components get large diffs.
  - The Burrito/Montada grouping depends on naming conventions.

### Option B: Rebuild the frontend from scratch to the build prompt
- Pros: a clean slate that follows the prompt's file layout exactly
  (`/order/[id]`, cart keyed by notes).
- Cons:
  - Duplicates or throws away working, tested logic.
  - A cart keyed by notes would produce orders the API rejects.
  - The route rename breaks status links.

### Option C: Add a `variant_group` column (and drink flag) before building the UI
- Pros:
  - The grouping becomes explicit and survives renames.
  - The menu API could return grouped products directly.
  - Drinks become data instead of a list of names.
- Cons:
  - Needs a schema migration, a seed change and an API change before any UI
    work.
  - That is a separate PR touching the data model, and it would need its own
    ADR (`coding_standards.md` §9).

## Rationale

The flow's business logic already works and is tested. What's missing is the
look and a few UI affordances. Option A gets the design in front of customers
with the least risk and no backend dependency, which fits "don't build for scale
you don't have" (`coding_standards.md` §1) and the small-team constraint in
`architecture.md` §1. Option C is the better long-term model for variants, but
deriving the grouping is cheap, pure, unit-tested and easy to replace. Once
`variant_group` exists, `groupMenuItems()` becomes a simple mapping and the UI
doesn't change.

## Consequences

- **Easier:**
  - Brand changes happen in one place (the Tailwind theme).
  - Photos can go live with a data update.
  - Montada upsell is a single tap on the detail screen.
- **Harder:**
  - Menu naming conventions now matter: "Burrito de X" / "Montada de X" and
    matching names across `Burritos` and `Montadas`.
  - `DRINK_NAMES` has to be kept in sync with the menu by hand.
- **Debt:**
  - The Pedidos and Cuenta tabs are minimal until the API supports them (see
    Gaps).
  - Search and grouping run on every render of the menu page. That's fine for
    about 55 items.
- **Revisit when:**
  - the menu grows past about 150 items,
  - variants beyond Burrito/Montada appear (sizes, tortilla types), which would
    trigger Option C,
  - the app and API share a domain, which would trigger the cookie-based auth
    in §2, or
  - card payments go live, which would enable the "Tarjeta" option.

## Gaps (API / data the screens need that don't exist yet)

| Gap | Needed by | Interim frontend behavior |
|---|---|---|
| **No capacity check.** `capacity_slots` exists but no code reads it, which contradicts `architecture.md` §4.3 and §5. | 04 / order creation | None. This is a server-side follow-up and should be fixed before launch. |
| No pickup-slots endpoint (`GET /pickup-slots`). | 03 "Cambiar", 04 time picker | The client computes 15-minute slots from `shop.hours` (`lib/pickup.ts`). The server still validates them. |
| No "my orders" list (`GET /orders?mine`). | Pedidos tab | `listMyOrders()` is typed and marked `// TODO(api)`. Until it exists, the tab opens the last order ID, kept in localStorage (`elpesado.lastOrder.v1`), or shows an empty state. |
| No account endpoints (profile, log out server-side). | Cuenta tab | Shows the masked phone and "Cerrar sesión", which clears local auth. Without a token it shows "Aún no has hecho un pedido". |
| No drink flag on `menu_items`. | `<MenuImage>` placeholder | Explicit `DRINK_NAMES` list. |
| No `variant_group` on `menu_items`. | 02 Burrito/Montada choice | Derived `groupMenuItems()` (§3). |

## Resolved questions (2026-11-10)

- **Pedidos tab:** showing only the last order is enough for launch. `GET /orders?mine` is a later nice-to-have, not a launch blocker.
- **Paired montadas:** they appear under the `Montadas` chip as well as on the burrito's detail screen (§3).
- **Order number:** screen 06 shows "Pedido #{orders.id}". The ID is a serial integer, so it is already short and unique. A truncated number would collide every few days at ~500 orders/day, and pickup matching uses name + last 4 digits of the phone anyway (`architecture.md` §4.7). A daily ticket number can be revisited if staff ask for one.
- **Discada prices:** confirmed and already in the database. No action needed.
- **Photos:** they will live in a blob storage service (`architecture.md` §2: S3 or R2). `<MenuImage>` uses `next/image`, and the bucket's public hostname is added to `images.remotePatterns` in `next.config.ts` once the provider is chosen. Until then every `image_url` is null and the placeholder shows.

## Open questions

- ~~Which blob storage provider and public hostname will the photos use?~~ Resolved by ADR-005 (2026-11-11): a public Supabase Storage bucket, `menu-images`. Add `<project-ref>.supabase.co` with path `/storage/v1/object/public/menu-images/**` to `images.remotePatterns` in `next.config.ts`.

## Related

- `architecture.md` §2 (OTP over WhatsApp), §3 (data model), §4 (order flow), §5 (capacity), §7 (non-goals)
- ADR-002: frontend architecture (extended by this ADR)
- ADR-003: WhatsApp OTP via Twilio Verify (why the copy says WhatsApp)
- `design/README.md` and `design/mockups/*` (visual spec)
- `docs/plans/frontend-ordering-screens.md` (implementation plan)
