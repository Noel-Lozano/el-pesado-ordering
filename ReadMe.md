# El Pesado Ordering

Online ordering system for **Burritos El Pesado**, a burrito shop on the
Mexico–US border. Built to handle in-store pickup orders (ASAP or
scheduled) across online, phone, and in-store channels, with live kitchen
capacity management during lunch-rush traffic from a nearby university.

> ~500 orders/day across channels, dual-currency cash handling (MXN/USD),
> and SMS notifications to both Mexican and American phone numbers.

## Features

- 🌯 Online menu with photos, categories, and availability toggling
- 🕒 ASAP or scheduled pickup, gated by real-time kitchen capacity
- 📱 Phone-number identity with SMS OTP verification — no passwords
- 🖥️ Live staff order screen (WebSocket, with polling fallback)
- 💳 Card, and bank transfer via Stripe — plus
  in-person cash accepted in MXN or USD
- 🔁 Multi-channel order tracking (online / phone / in-store) sharing one
  capacity pool, so the kitchen is never oversold from any direction
- 🚫 No-show tracking per customer, with automatic slot release after a
  grace period
- 💬 SMS notifications for order confirmed / ready / pickup reminder

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (React), deployed as a PWA |
| Backend | Node.js / Express |
| Database | PostgreSQL |
| Image storage | Supabase Storage (public `menu-images` bucket) |
| Payments | Stripe (Mexico) — card, bank transfer |
| SMS | Twilio — OTP + notifications |
| Hosting | Vercel (frontend) · Railway (backend) · Supabase (DB) |

See [`docs/architecture.md`](docs/architecture.md) for the full system
design and the reasoning behind these choices — this is intentionally a
small, single-backend system, not a microservices setup, sized to actual
order volume rather than hypothetical scale.

## Project docs

- [`docs/architecture.md`](docs/architecture.md) — system design, data
  model, order flow, capacity model, no-show mitigation
- [`docs/coding_standards.md`](docs/coding_standards.md) — conventions
  for this codebase
- [`docs/adr/`](docs/adr/) — architecture decision records, e.g.
  [ADR-005](docs/adr/005-railway-backend-supabase-storage.md) (Railway
  hosting, Supabase Storage), plus the
  [template](docs/adr/adr_template.md) for new ones

## Getting started

```bash
git clone https://github.com/<your-username>/el-pesado-ordering.git
cd el-pesado-ordering

# backend/ and frontend/ are separate npm projects; this installs both
npm run install:all

# copy the env templates and fill in real values
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local

# run database migrations (and optionally seed the menu)
npm run migrate
npm --prefix backend run seed:menu

# start the API (port 4000) and the web app (port 3000), in two terminals
npm run dev:api
npm run dev:web
```

Requires Node 24.

### Environment variables

Each app has its own template, which lists and explains every variable:

- [`backend/.env.example`](backend/.env.example): database, JWT secret,
  Twilio Verify (WhatsApp OTP), CORS origins. Validated at startup by
  `backend/src/config/env.ts`, so a missing key stops the server right away.
- [`frontend/.env.example`](frontend/.env.example): the backend API URL.

## Deployment

Every PR into `main` runs [CI](.github/workflows/ci.yml): type checks,
lint, unit tests, a frontend build, and the order-flow integration tests
against a throwaway Postgres. Make it a required check on `main` in
branch protection so a failing PR can't merge; Railway's "Wait for CI"
also holds backend deploys until it passes.

| Part | Where | Setup |
|---|---|---|
| Backend | Railway | Root directory `backend` · build `npm run build` · start `npm start` · pre-deploy `npx node-pg-migrate up` · "Wait for CI" on |
| Frontend | Vercel | Root directory `frontend` · `NEXT_PUBLIC_API_BASE_URL` = the Railway URL |
| Database | Supabase Postgres | `DATABASE_URL` on Railway = the Session Pooler string |
| Menu photos | Supabase Storage | Public bucket `menu-images` |

On Railway, set every variable from `backend/.env.example`, with
`NODE_ENV=production` and the Vercel domain in `CORS_ORIGINS`.

**Adding a menu photo:** upload it to the `menu-images` bucket in the
Supabase dashboard, copy its public URL, and save it in that item's
`menu_items.image_url`. Re-running the menu seed never overwrites
`image_url`. See [ADR-005](docs/adr/005-railway-backend-supabase-storage.md)
for why, and for what changes once there's an upload endpoint.

## Status

🚧 In active development — MVP phase (core ordering + kitchen capacity).
See the phased build plan in project notes for what's shipped vs. planned.

## License

Private project — not licensed for reuse.