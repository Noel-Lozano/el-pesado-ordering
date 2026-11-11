# Implementation Plan: Customer Ordering Screens (01–06)

> Decision record: `docs/adr/004-frontend-ordering-screens.md`. Visual spec: `design/`.
> Branch: `feat/frontend-ordering-screens` (from `main`). One commit per row in §6.
> All paths below are relative to `frontend/` unless stated.

## 1. Approach in one paragraph

We restyle the existing flow in place (ADR-004, Option A). The reducer, storage,
JWT, phone, pickup, money, polling and API client stay and get reused. The
components under `src/components/*` are rebuilt from the mockups on top of a small
`ui/` kit and Tailwind tokens. Two things are new: the `/item/[id]` route and the
`groupMenuItems()` helper. No backend files change.

## 2. File tree

```
frontend/
├─ tailwind.config.ts                    MODIFY  tokens: colours, radii (4/6 only), shadow-hard, font-display/sans; drop darkMode
├─ vitest.config.mts                     MODIFY  include *.test.tsx; jsdom environment for component tests
├─ package.json                          MODIFY  devDeps: @testing-library/react, @testing-library/user-event, jsdom
├─ next.config.ts                        (unchanged until the blob storage hostname is known → images.remotePatterns)
├─ public/logo.jpg                       NEW     copied from design/assets/logo.jpg
└─ src/
   ├─ app/
   │  ├─ globals.css                     MODIFY  remove dark vars + Arial; base body = white/navy/Nunito
   │  ├─ layout.tsx                      MODIFY  Lilita One + Nunito via next/font/google; drop Geist
   │  ├─ page.tsx                        MODIFY  01 Menú (server: getMenu → groupMenuItems → <MenuScreen>)
   │  ├─ item/[id]/page.tsx              NEW     02 Detalle (server: getMenu, find product, notFound())
   │  ├─ cart/page.tsx                   (unchanged wrapper)
   │  ├─ checkout/page.tsx               (unchanged wrapper)
   │  ├─ checkout/verify/page.tsx        (unchanged wrapper)
   │  ├─ orders/[id]/page.tsx            (unchanged wrapper)
   │  ├─ error.tsx, loading.tsx, not-found.tsx   MODIFY  restyle with tokens
   │  └─ manifest.ts                     MODIFY  theme/background colours → navy/white
   ├─ components/
   │  ├─ ui/
   │  │  ├─ Button.tsx                   NEW     variants: primary (orange+navy text+shadow-hard), secondary (white+navy border), link
   │  │  ├─ Chip.tsx                     NEW     category chip, aria-pressed, rounded-sm
   │  │  ├─ Card.tsx                     NEW     2px navy border, rounded, optional `featured` (shadow-hard)
   │  │  ├─ RadioCard.tsx                NEW     <label> + native radio; selected = paper + 2.5px border; disabled variant (dashed)
   │  │  ├─ TopBar.tsx                   NEW     navy header, yellow back <Link aria-label>, title
   │  │  ├─ TabBar.tsx                   NEW     <nav aria-label="Navegación principal"> Menú/Pedidos/Cuenta, aria-current
   │  │  ├─ BottomActionBar.tsx          NEW     fixed footer wrapper (safe-area padding) for primary CTA
   │  │  └─ Badge.tsx                    NEW     "Desde 2 PM", "Requerido", "Próximamente"
   │  ├─ menu/
   │  │  ├─ MenuScreen.tsx               NEW     client: header, search, chips, list, floating cart bar, desktop grid+sidebar
   │  │  ├─ MenuHeader.tsx               NEW     logo, "BURRITOS EL PESADO" title, pickup line, search input
   │  │  ├─ MenuItemRow.tsx              NEW     replaces MenuItemCard (row on mobile, card on lg)
   │  │  ├─ MenuImage.tsx                NEW     image_url or emoji-on-yellow placeholder
   │  │  ├─ After2pmBanner.tsx           NEW     "Desde las 2 PM" banner
   │  │  ├─ ItemDetail.tsx               NEW     02 client body: variant RadioCards, notes, stepper, add
   │  │  ├─ AddToCartButton.tsx          MODIFY  icon button (44px, aria-label "Agregar {name}"), time-gate aware
   │  │  ├─ CategorySection.tsx          DELETE  (replaced by chip filtering)
   │  │  └─ MenuItemCard.tsx             DELETE  (replaced by MenuItemRow)
   │  ├─ cart/
   │  │  ├─ CartBar.tsx                  MODIFY  "Ver pedido · N · $total" floating bar
   │  │  ├─ CartSidebar.tsx              NEW     lg-only sticky sidebar (reuses CartLine + summary)
   │  │  ├─ CartView.tsx                 MODIFY  03 layout, empty state, reconcile notice
   │  │  ├─ CartLine.tsx                 MODIFY  MenuImage + name/meta + QuantityStepper; 0 → confirm remove
   │  │  ├─ CartSummary.tsx              MODIFY  Subtotal (N productos) / Total MXN / cash note
   │  │  ├─ PickupCard.tsx               NEW     "Recoger en tienda · Lo antes posible · Cambiar" (→ /checkout#pickup)
   │  │  └─ QuantityStepper.tsx          MODIFY  −/qty/+ 44px, aria-labels, min/max
   │  ├─ checkout/
   │  │  ├─ CheckoutForm.tsx             MODIFY  04 single screen: Tus datos / ¿Cuándo? / Pago / summary / hint + CTA
   │  │  ├─ PhoneInput.tsx               MODIFY  yellow country <select> MX +52 / US +1 + tel input
   │  │  ├─ PickupTimePicker.tsx         MODIFY  RadioCards ASAP / Programar hora + time <select>
   │  │  ├─ PaymentOptions.tsx           NEW     cash RadioCard + disabled "Tarjeta · Próximamente"
   │  │  ├─ OtpInput.tsx                 MODIFY  6 boxes, auto-advance, paste, backspace, one-time-code
   │  │  ├─ ResendCountdown.tsx          NEW     60s countdown → "Reenviar código"
   │  │  ├─ VerifyForm.tsx / VerifyView.tsx / CheckoutView.tsx   MODIFY  restyle; logic kept
   │  ├─ order/
   │  │  ├─ OrderStatusView.tsx          MODIFY  06 navy hero, StatusTracker, pickup+total card, "Volver al menú"
   │  │  └─ StatusTracker.tsx            NEW     Recibido → Preparando → Listo para recoger (from status)
   │  └─ account/
   │     └─ AccountSheet.tsx             NEW     Cuenta tab: masked phone + "Cerrar sesión" (ADR-004 Gaps)
   ├─ context/
   │  ├─ cartReducer.ts                  MODIFY  `add` accepts {quantity, note}; returns noteReplaced flag via helper
   │  └─ cartReconcile.ts                NEW     reconcileCart(lines, products) → { lines, droppedNames }
   ├─ lib/
   │  ├─ menuGrouping.ts                 NEW     groupMenuItems(), MenuProduct type
   │  ├─ menuImage.ts                    NEW     DRINK_NAMES, placeholderEmoji(item, category)
   │  ├─ menuSearch.ts                   NEW     filterProducts(products, query) — accent-insensitive
   │  ├─ lastOrder.ts                    NEW     localStorage `elpesado.lastOrder.v1`
   │  ├─ api.ts                          MODIFY  add listMyOrders() // TODO(api)
   │  ├─ strings.ts                      MODIFY  new copy (WhatsApp wording, ADR-004 §7)
   │  └─ theme.ts                        MODIFY  BRAND_COLOR = navy
   └─ tests (co-located)
      ├─ lib/menuGrouping.test.ts        NEW
      ├─ lib/menuImage.test.ts           NEW
      ├─ lib/menuSearch.test.ts          NEW
      ├─ lib/money.test.ts               EXTEND (whole-peso + MXN suffix cases)
      ├─ context/cartReducer.test.ts     EXTEND (add with qty/note, note replace, qty 0)
      ├─ context/cartReconcile.test.ts   NEW
      ├─ components/checkout/OtpInput.test.tsx        NEW
      └─ components/cart/QuantityStepper.test.tsx     NEW
```

## 3. Shared components and where they're used

| Component | 01 Menú | 02 Detalle | 03 Carrito | 04 Checkout | 05 Código | 06 Pedido |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Button | ✓ (cart bar) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Chip | ✓ | | | | | |
| MenuItemRow | ✓ | | | | | |
| MenuImage | ✓ | ✓ | ✓ | | | |
| QuantityStepper | (lg sidebar) | ✓ | ✓ | | | |
| TabBar | ✓ | | | | | ✓ |
| TopBar | | ✓ (overlay back) | ✓ | ✓ | ✓ | |
| Card | | | ✓ | ✓ | | ✓ |
| RadioCard | | ✓ | | ✓ | | |
| OtpInput | | | | | ✓ | |
| Badge | ✓ | ✓ | ✓ | ✓ | | |
| BottomActionBar | | ✓ | ✓ | ✓ | ✓ | |

## 4. Per-screen checklist

### 01 Menú (`/`)
- **Data:** `MenuResponse`, then `groupMenuItems()`, which gives `MenuProduct[]` by category. Also the cart totals and `useNow()`.
- **API:** `getMenu()`, called on the server with ISR `revalidate = 60`. This exists already.
- **Components:**
  - MenuHeader: logo, title in yellow with a red outline (`-webkit-text-stroke` and `paint-order`), the "Recoger en tienda · Lo antes posible" line, and search.
  - Chip row (horizontal scroll), After2pmBanner, a category heading with "N opciones", MenuItemRow × N, CartBar and TabBar.
  - At lg: a grid plus CartSidebar.
- **States:**
  - Loading: the existing `loading.tsx` spinner, restyled.
  - Empty search: "No encontramos “{q}”".
  - API error: `error.tsx` with "Reintentar".
  - Shop closed: a banner with the next opening time (`getNextOpening`).
  - Reconcile notice when cart items were dropped.
- **Acceptance:**
  - [ ] At 390 px it matches `01-menu.dc.html`: header 104/…, chips are `rounded-sm` with a hard shadow when selected, rows have a 64 px image slot and a 44 px add button.
  - [ ] Search filters names and descriptions client-side, ignoring accents ("jamon" finds "jamón") and case. Chips hide while a query is active.
  - [ ] A paired product shows once, at the burrito price. Tapping the row opens `/item/[id]`. The add button on a paired row also opens the detail screen, because a choice is required. On an unpaired row it adds 1 directly.
  - [ ] An after-2 PM item shows the "Desde 2 PM" badge. Before 14:00 shop time its add button is disabled, with the reason given in `aria-describedby`.
  - [ ] The cart bar appears only when there are items and reads "Ver pedido · N · $total".
  - [ ] TabBar shows Menú with `aria-current="page"`.
  - [ ] At ≥1024 px the layout follows `00-desktop-ordering-page`: a 1200 px container, a `minmax(250px,1fr)` grid and a sticky sidebar.

### 02 Detalle (`/item/[id]`)
- **Data:** the `MenuProduct` that contains the item ID, with its variants, plus the cart.
- **API:** `getMenu()` on the server, with ISR. If the ID isn't found, it calls `notFound()`.
- **Components:** MenuImage (large, edge to edge), a back button overlaid on the image, the name, price and description, a "¿Cómo lo quieres?" heading with a red "Requerido" badge, two RadioCards (Burrito $X / Montada · con queso gratinado $Y), a notes `<textarea maxLength=140>` with a counter, a QuantityStepper, and "Agregar · $total" in BottomActionBar.
- **States:**
  - Item unknown: `not-found.tsx`.
  - Time-gated: "Agregar" is disabled with "Disponible desde las 2 PM".
  - The note was replaced on add: a notice appears on `/` or `/cart` after the redirect.
- **Acceptance:**
  - [ ] The variant choice is shown only for paired products. Its radios are required, and the variant from the URL ID is preselected, so the user never faces an empty required choice.
  - [ ] "Agregar · $total" = selected variant price × qty, recalculated live.
  - [ ] Adding dispatches `add {menuItemId of the chosen variant, quantity, note}` and then goes back to `/`.
  - [ ] Notes are capped at 140 characters, and the counter is announced politely.

### 03 Tu pedido (`/cart`)
- **Data:** cart lines and totals, the pickup choice from the checkout draft (default ASAP), and the menu for reconcile, which the cart view already fetches on the client.
- **API:** `getMenu()` for reconcile. Nothing else.
- **Components:** TopBar "Tu pedido"; PickupCard ("Cambiar" goes to `/checkout#pickup`); a list of CartLines (MenuImage, name, meta = variant/category and note, price, stepper); CartSummary ("Subtotal (N productos)", "Total $X MXN", "Pagas en efectivo al recoger"); and "Continuar · $X" in BottomActionBar.
- **States:**
  - Cart not loaded yet: a skeleton, never a false empty state.
  - Empty: "Tu pedido está vacío" with "Ver menú".
  - Reconcile notice.
  - Removing via quantity 0: a confirm prompt "¿Quitar {name}?" with Quitar / Cancelar.
- **Acceptance:**
  - [ ] Matches `03-cart.dc.html` at 390 px.
  - [ ] A stepper at 1 asks for confirmation before removing. Quantity is capped at 20.
  - [ ] Totals are integer cents, formatted only at render.

### 04 Confirmar pedido (`/checkout`)
- **Data:** cart, menu (shop hours and `availableFrom`), auth (prefill and remembered device), and the checkout draft (name, country, phone, pickup, idempotencyKey).
- **API:**
  - `sendCode(phone)`, which already exists. It is skipped when `isTokenUsable` passes and the phone matches. In that case the button submits the order directly, using the existing logic.
- **Components:** TopBar "Confirmar pedido"; Card "Tus datos" (name input, PhoneInput); Card "¿Cuándo lo recoges?" (RadioCards plus a slot `<select>` when scheduled); Card "Pago" (PaymentOptions); a yellow summary strip ("N productos · recoger en tienda", "$X MXN", "Ver detalle" goes to `/cart`); a hint line; and the CTA in BottomActionBar.
- **States:**
  - Invalid form: the CTA is disabled and the hint explains why, in this order: "Escribe tu nombre para continuar." → "Escribe un teléfono de 10 dígitos." → "Elige la hora para recoger." → "Agrega algo del menú."
  - Sending: a spinner, and the button is disabled.
  - Errors: `too_many_requests`, `verification_unavailable`, `network_error` and `shop_closed`, each mapped to a Spanish message.
  - Empty cart: redirect to `/cart`.
- **Acceptance:**
  - [ ] There is one screen with no steps. The phone is stored as E.164 via `normalizePhone`.
  - [ ] The CTA reads "Enviar código por WhatsApp" (ADR-004 §7). When the device is remembered it reads "Confirmar pedido".
  - [ ] "Tarjeta · Próximamente" is visible, not focusable as a radio, and `aria-disabled`.
  - [ ] One `idempotencyKey` is used per checkout attempt. It survives going back from verify and is cleared only after the order succeeds. This is the existing behaviour and must be kept.

### 05 Código de WhatsApp (`/checkout/verify`)
- **Data:** the draft's E.164 phone, cart lines and pickup.
- **API:** `verifyCode(phone, code)`, then `createOrder(req, token, idempotencyKey)`, then `router.replace('/orders/{id}')`. Resending uses `sendCode`. All of these exist already.
- **Components:** TopBar "Confirma tu teléfono"; the heading "Escribe el código"; "Te mandamos 6 dígitos por WhatsApp al {masked}"; OtpInput; ResendCountdown (60 s); a "Cambiar número" link to `/checkout`; the privacy line; and "Confirmar pedido" in BottomActionBar.
- **States:**
  - No draft: redirect to `/checkout`.
  - Verifying or creating: the button is disabled with a spinner.
  - `invalid_code`: the inputs are cleared and focused, and the message is "Código incorrecto".
  - `too_many_attempts`.
  - Order errors (`item_not_available_yet`, `shop_closed`, `menu_item_unavailable`): back to the cart with a message.
- **Acceptance:**
  - [ ] Six inputs with `inputMode="numeric"` and `autocomplete="one-time-code"` on the first one. Typing advances focus, Backspace on an empty box moves back, and pasting "123456" into any box fills all six. Each box has `aria-label="Dígito N"` and the group is labelled "Código de 6 dígitos".
  - [ ] Six digits enable "Confirmar pedido". Auto-submitting on the sixth digit is optional and stays off; we wait for the tap.
  - [ ] Resend is disabled for 60 s, and the countdown is shown as `m:ss`.
  - [ ] On success, `lastOrder` is saved and the cart and draft are cleared.

### 06 Pedido recibido (`/orders/[id]`)
- **Data:** `Order` from polling.
- **API:** `getOrder(id, token)` every 15 s via `useOrderPolling`. This exists already.
- **Components:** a navy hero (check tile, "¡Pedido recibido!" in yellow with a red stroke, the keep-open line, "Pedido #{id}"); StatusTracker; a Card with the pickup (ASAP or `requestedClockTime`), "Pagas en efectivo · N productos", the total, and a "Ver detalle del pedido" disclosure listing the items; a "Volver al menú" button; and TabBar with Pedidos active.
- **Status mapping:** `created`/`confirmed` = Recibido, `preparing` = Preparando, `ready` = Listo para recoger, `picked_up` = all steps done. `cancelled` and `no_show` show a red notice in place of the tracker.
- **States:** the existing `loading`, `offline` (stale data plus a banner), `notFound` and `unauthorized` (a link to verify again).
- **Acceptance:**
  - [ ] The tracker steps carry `aria-current="step"` on the active one. A status change is announced through `aria-live="polite"`.
  - [ ] On `ready`, the existing behaviour stays: a banner, a tab-title change and vibration.
  - [ ] Matches `06-confirmation.dc.html` at 390 px, apart from the copy change.

## 5. Test plan

| Test | Type | Cases |
|---|---|---|
| `menuGrouping.test.ts` | unit | Burritos↔Montadas pair by exact name; "Burrito de X"↔"Montada de X" in after-2 PM; unpaired burrito / montada-only / Extras produce single products; case/whitespace mismatch does **not** pair; preselect variant by either id; order preserved by `display_order` |
| `menuImage.test.ts` | unit | 🥤 for listed drinks in Extras; 🌯 for Tortilla/Papitas; 🌯 for a drink name outside Extras |
| `menuSearch.test.ts` | unit | accent/case-insensitive; matches description; empty query = all |
| `money.test.ts` (extend) | unit | `formatMXN(4500)` = "$45"; non-integer throws; total with " MXN" suffix helper |
| `cartReducer.test.ts` (extend) | unit | add with qty 3 + note; re-add same id sums qty (clamped 20); different non-empty note replaces; empty note keeps existing; setQuantity 0 removes |
| `cartReconcile.test.ts` | unit | drops missing ids and returns names; refreshes price/name; untouched when all present |
| `OtpInput.test.tsx` | component (jsdom + Testing Library) | typing advances focus; backspace on empty moves back; paste fills all 6; non-digits ignored; onComplete fires with 6 digits |
| `QuantityStepper.test.tsx` | component | +/− change value; − disabled at min; + disabled at max 20; buttons have aria-labels |

Every commit gates on `npm run lint`, `npm run typecheck` and `npm test` in
`frontend/`. The backend is untouched. We still run its `npm test` once before the
PR as a sanity check.

## 6. Commit plan

| # | Message | Contents |
|---|---|---|
| 1 | `docs: add ADR and implementation plan for ordering screens` | ADR-004 and this plan |
| 2 | `feat(ui): add design tokens, fonts and shared components` | Tailwind tokens, fonts, globals, theme/manifest colours, `components/ui/*`, MenuImage + `menuImage.ts`, QuantityStepper restyle, Testing Library/jsdom setup with the stepper test, `public/logo.jpg` |
| 3 | `feat(menu): implement 01 menu screen` | `menuGrouping.ts` and `menuSearch.ts` with their tests, MenuScreen/Header/Row/Banner, CartBar, TabBar wiring, AccountSheet, `lastOrder.ts`, `listMyOrders` TODO(api), `cartReconcile` |
| 4 | `feat(menu): implement 02 item detail screen` | `/item/[id]`, ItemDetail, reducer `add` with qty and note (and tests), CartSidebar for lg |
| 5 | `feat(cart): implement 03 cart screen` | CartView/Line/Summary, PickupCard, remove confirm |
| 6 | `feat(checkout): implement 04 checkout screen` | CheckoutForm, PhoneInput, PickupTimePicker, PaymentOptions, hint logic |
| 7 | `feat(checkout): implement 05 OTP verification screen` | OtpInput rebuild with its test, ResendCountdown, VerifyForm/View |
| 8 | `feat(order): implement 06 order confirmation screen` | OrderStatusView, StatusTracker, error/loading/not-found restyle, removal of dead components |

**For every commit:**
- Stage only that commit's paths, with `git add <paths>`.
- Lint, typecheck and tests must pass, with no skipped hooks.
- Compare the screen with its mockup at 390 px.
- The commit body covers: what was built, which mockup it implements, any intentional differences (e.g. the WhatsApp copy) and any `TODO(api)` left behind.

**After commit 8:** push and open a PR titled `feat: customer ordering flow (screens 01–06)`. Its body has:
- a summary,
- links to the ADR and this plan,
- the commit table,
- local test steps:
  - run `backend: npm run dev`, then `frontend: npm run dev`;
  - visit `/`, `/item/{id}`, `/cart`, `/checkout`, `/checkout/verify` and `/orders/{id}`;
  - use a WhatsApp-enabled test number on the Twilio Verify sandbox;
- the gaps from ADR-004 (capacity check, `listMyOrders` TODO(api), blob storage hostname for `remotePatterns`),
- a checklist of screenshots at 390 px. Screenshots aren't captured automatically.

The PR is not merged.

## 7. Risks

- **Large diffs in existing components.** We keep the logic-bearing functions
  (`CheckoutForm` submit, `VerifyForm` flow, `useOrderPolling`) and change only
  the markup around them.
- **Hydration and time gating.** The add button starts disabled while `useNow()`
  is null, so the server and client render the same thing.
- **`paint-order` / `-webkit-text-stroke`.** Support varies across browsers. If
  the stroke is missing, the title still has the red `text-shadow`, so it stays
  legible.
