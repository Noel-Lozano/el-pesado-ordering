# Claude Code prompt — Implement the 6 customer ordering screens

> Paste everything below the line into Claude Code (started in Plan Mode from the repo root).
> Before you do, copy the `design/` folder from the handoff zip into the repo root.

---

You are implementing the customer ordering flow for **El Pesado Ordering**, the Next.js frontend in
`frontend/`. The visual spec lives in `design/`. Work in four phases and **stop for my review at the
end of Phase 2** before writing any app code.

## Context — read these first

1. `CLAUDE.md`, `architecture.md`, `coding_standards.md`, `adr_template.md` (follow them; they win over this prompt if they conflict, but tell me about the conflict)
2. `design/README.md`, which covers the tokens, how to read the mockups and the route map
3. `design/mockups/01-menu.dc.html` … `06-confirmation.dc.html` (mobile, 390×844) and
   `00-desktop-ordering-page.dc.html` (desktop layout + behavior reference)
4. The backend: list every Express route in `backend/` and the migrations in the backend
   migrations folder, so you know which endpoints and columns really exist. **Never invent an
   endpoint.** If one the screens need is missing, put it in the ADR's "Gaps" section and build
   the frontend against a typed client function that is clearly marked `// TODO(api)`.

Database tables (Supabase Postgres, already migrated):
- `menu_items`: id, name, description, price_cents, image_url (all null for now), category
  (`Burritos` | `Montadas` | `Desayunos` | `Después de las 2 PM` | `Extras`), is_available,
  display_order, available_from (time, e.g. 14:00, null = all day)
- `customers`: id, phone (E.164), phone_verified, name, no_show_count, is_blocked
- `orders`: id, customer_id, channel, status, fulfillment_type, requested_time (nullable = ASAP),
  estimated_ready_at, payment_method, payment_status, currency_paid, total_cents, idempotency_key (uuid)
- `order_items`: id, order_id, menu_item_id, quantity, price_at_order_cents, notes
- `capacity_slots`: day_of_week/date, start_time, end_time, max_orders

Existing backend: SMS OTP auth routes with Twilio + JWT middleware. Check their exact paths and payloads.

## The 6 screens

All UI copy is **Spanish**, exactly as in the mockups. Mobile-first; at ≥1024px use the desktop
mockup's layout (content + cart sidebar).

| # | Screen | Route | Must do |
|---|---|---|---|
| 01 | Menú | `/` | Navy header (logo, "BURRITOS EL PESADO" in yellow with red outline, pickup line, search). Category chips. "Desde las 2 PM" banner. Item rows (name, description, price, image slot + add button). Floating "Ver pedido · N · $total" bar when the cart has items. Bottom tab bar (Menú / Pedidos / Cuenta). Search filters items client-side. |
| 02 | Detalle del producto | `/item/[id]` | Large image slot, name, price, description. Required "¿Cómo lo quieres?" choice **Burrito / Montada** when both versions exist (see grouping below). "Instrucciones especiales" textarea → `order_items.notes` (max 140 chars). Qty stepper + "Agregar · $total". |
| 03 | Tu pedido | `/cart` | Pickup card (ASAP / scheduled, "Cambiar"). Line items with steppers (qty 0 removes after confirm). Subtotal, Total in MXN. "Pagas en efectivo al recoger". "Continuar". Empty state. |
| 04 | Checkout | `/checkout` | **One screen**: name, phone with MX +52 / US +1 selector (store E.164), pickup ASAP vs scheduled time, payment = cash (card shown disabled "Próximamente"), order summary. "Enviar código por SMS" disabled until valid, with a hint explaining why. |
| 05 | Código SMS | `/checkout/verify` | 6 single-digit inputs (auto-advance, paste a full code, `autocomplete="one-time-code"`, `inputMode="numeric"`), masked phone, resend with 60s countdown, "Cambiar número". On success: create the order, then go to 06. |
| 06 | Pedido recibido | `/order/[id]` | Navy hero with check + "¡Pedido recibido!", order number = `orders.id`. Status tracker Recibido → Preparando → Listo para recoger from `orders.status`. Pickup + total card. "Volver al menú". Tab bar with Pedidos active. |

### Rules that apply to every screen
- **Tokens:** put every color, radius, shadow and font from `design/README.md` in the Tailwind theme
  and use them by name. No raw hex in components. Corners are 4px/6px only, with no pills.
- **Fonts:** `next/font/google` for Lilita One + Nunito.
- **Images:** a single `<MenuImage item>` component. It renders `image_url` when present and the
  emoji placeholder on a yellow box when it's null (🥤 for drinks in `Extras`, 🌯 otherwise).
  When photos arrive, only the data changes.
- **Money:** keep `price_cents` integers everywhere. Format only at render with
  `Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })`.
  **The client total is display-only.** The server recomputes from `menu_items` and stores
  `price_at_order_cents`.
- **After-2 PM items:** show the "Desde 2 PM" badge. Before 14:00 shop time
  (`America/Ciudad_Juarez`) they can be viewed but "Agregar" is disabled with a reason. The server
  must enforce this too (note it in the ADR if the backend doesn't).
- **Accessibility:** touch targets ≥44px. Real `<button>`, `<a>`, `<label>` elements. `aria-label` on
  icon buttons. Text contrast ≥4.5:1 (navy on orange passes, white on orange does not).
- **Double-submit safety:** generate one `idempotency_key` (uuid) per checkout attempt and reuse it
  on retries.

### Burrito / Montada grouping
The DB stores burritos and montadas as **separate rows** (e.g. "Asado" in Burritos at $45, "Asado" in
Montadas at $65). Screen 02 shows them as one product with a required choice. Implement a pure,
unit-tested `groupMenuItems()` helper that pairs Burritos ↔ Montadas by exact `name`, and pairs
"Burrito de X" ↔ "Montada de X" in `Después de las 2 PM`. Unpaired items show no choice.
Record in the ADR that this is a derived grouping, and list the alternative of adding a
`variant_group` column.

### State
- `CartContext` (useReducer): lines keyed by `menu_item_id` + `notes`, persisted to `localStorage`
  under a versioned key. Re-validate against the latest menu on load and drop unavailable items
  with a notice.
- `AuthContext` holds the JWT from OTP verify. Decide the storage approach (memory + httpOnly
  cookie vs localStorage) in the ADR, with the XSS trade-off spelled out.
- Checkout form state lives in the checkout route. Pass to `/checkout/verify` only what's needed.

## Phase 1 — ADR

Create the next numbered ADR with `adr_template.md` (e.g. `docs/adr/00X-frontend-ordering-flow.md`;
match the existing folder/numbering). It must cover:
- Routing and screen map (App Router), and mobile vs desktop layout strategy
- Cart + auth state approach (and the token storage decision)
- Burrito/Montada grouping decision + alternatives
- Money handling + server-side price authority
- Design tokens in the Tailwind theme, and the image placeholder strategy
- Time-gated items (`available_from`) on client + server
- **Gaps:** every endpoint/column the screens need that doesn't exist yet
- Consequences and open questions

## Phase 2 — Implementation plan

Create `docs/plans/frontend-ordering-screens.md` with:
- File tree you will create/modify (components, routes, contexts, lib, tests)
- The shared components list (Button, Chip, MenuItemRow, MenuImage, QtyStepper, TabBar, TopBar,
  Card, RadioCard, OtpInput) and which screens use each
- Per-screen checklist: data needed → API call → components → states (loading, empty, error) → acceptance criteria
- Test plan (unit for `groupMenuItems`, money formatting, cart reducer; component tests for OtpInput and stepper)
- The commit plan below

**Then STOP.** Show me the ADR and plan summary and wait for my approval. I will make my own edits
to these docs before you continue.

## Phase 3 — Build, one commit per screen

Branch: `feat/frontend-ordering-screens` (create it from the main branch; never commit to main).

Commit sequence ([Conventional Commits](https://www.conventionalcommits.org/) format):
1. `docs: add ADR and implementation plan for ordering screens`
2. `feat(ui): add design tokens, fonts and shared components`
3. `feat(menu): implement 01 menu screen`
4. `feat(menu): implement 02 item detail screen`
5. `feat(cart): implement 03 cart screen`
6. `feat(checkout): implement 04 checkout screen`
7. `feat(checkout): implement 05 OTP verification screen`
8. `feat(order): implement 06 order confirmation screen`

For every commit:
- Only that commit's files are staged (`git add <paths>`, not `git add -A`)
- `npm run lint`, typecheck and tests pass before committing. If something fails, fix it in
  the same commit and don't skip hooks
- Compare the screen at 390px wide against its mockup and list any intentional differences in the
  commit body
- Commit body: what was built, which mockup it implements, and any `TODO(api)` left behind

## Phase 4 — Pull request

Push the branch and open a PR to main titled
`feat: customer ordering flow (screens 01–06)`. The PR description should include:
- Summary + link to the ADR and plan
- A table of the 8 commits and what each contains
- How to test locally (routes to visit, a test phone number flow)
- **Gaps / follow-ups:** missing endpoints, the server-side time gate, real photos, confirm the Discada prices
- Screenshots of each screen at 390px if you can produce them, otherwise a checklist for me to capture them

Don't merge. I'll review the PR.
