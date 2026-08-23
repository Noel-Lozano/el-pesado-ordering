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
- 💳 Card, OXXO (cash-voucher), and bank transfer via Stripe — plus
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
| Image storage | Cloudflare R2 / S3 |
| Payments | Stripe (Mexico) — card, OXXO, bank transfer |
| SMS | Twilio — OTP + notifications |
| Hosting | Vercel (frontend) · Railway/Render (backend) · Neon/Supabase (DB) |

See [`docs/architecture.md`](docs/architecture.md) for the full system
design and the reasoning behind these choices — this is intentionally a
small, single-backend system, not a microservices setup, sized to actual
order volume rather than hypothetical scale.

## Project docs

- [`docs/architecture.md`](docs/architecture.md) — system design, data
  model, order flow, capacity model, no-show mitigation
- [`docs/coding_standards.md`](docs/coding_standards.md) — conventions
  for this codebase
- [`docs/adr_template.md`](docs/adr_template.md) — template for recording
  significant decisions as the project evolves

## Getting started

```bash
git clone https://github.com/<your-username>/el-pesado-ordering.git
cd el-pesado-ordering

# install dependencies
npm install

# copy env template and fill in real values
cp .env.example .env

# run database migrations
npm run migrate

# start the dev server
npm run dev
```

### Environment variables

See `.env.example` for the full list. At minimum you'll need:

```
DATABASE_URL=
STRIPE_SECRET_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
```

## Status

🚧 In active development — MVP phase (core ordering + kitchen capacity).
See the phased build plan in project notes for what's shipped vs. planned.

## License

Private project — not licensed for reuse.