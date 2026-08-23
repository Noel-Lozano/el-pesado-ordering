# Coding Standards — Burrito Ordering App

These standards exist to keep a small codebase maintainable by a small (or
solo) team. When in doubt, favor the boring, explicit option over the
clever one — this is a payments-adjacent, food-ordering system, and bugs
here cost real money and real customers standing in line.

## 1. General principles

- **Optimize for readability over cleverness.** Anyone should be able to
  open a file and understand it without deep context.
- **Explicit over implicit.** No magic. Prefer named constants, clear
  function names, and explicit types over inference-heavy or "smart"
  code.
- **Small, focused functions/modules.** If a function does two unrelated
  things, split it.
- **Don't build for scale you don't have.** Match the architecture
  document — no premature abstraction, no speculative infrastructure.

## 2. Language & formatting

- TypeScript everywhere (frontend and backend) — not plain JavaScript.
  Order/payment/capacity logic benefits enormously from compile-time
  checks.
- Formatter: Prettier, default config, enforced via pre-commit hook.
- Linter: ESLint with a standard TypeScript config. No disabling rules
  inline without a comment explaining why.
- No `any` in TypeScript unless genuinely unavoidable (and commented why).

## 3. Naming conventions

- `camelCase` for variables and functions.
- `PascalCase` for React components, types, and interfaces.
- `snake_case` for database columns and tables (Postgres convention).
- Booleans read as questions: `isBlocked`, `phoneVerified`, not `blocked`,
  `verified`.
- Money is always an integer in the smallest currency unit (centavos), 
  never a float. Never store or compute prices as `float`/`double`.

## 4. Database

- All schema changes go through migrations (e.g. Prisma Migrate,
  Knex, or node-pg-migrate) — never hand-edit the production schema.
- Every table has `id`, `created_at`; mutable tables also get `updated_at`.
- Foreign keys are enforced at the database level, not just checked in
  application code.
- Any operation that reads-then-writes shared state (capacity slots,
  no-show counts) must happen inside a transaction with appropriate
  row-level locking (`SELECT ... FOR UPDATE`). This is not optional — see
  architecture.md §5.
- No raw SQL string concatenation with user input — parameterized queries
  only.

## 5. API design

- REST, JSON. No GraphQL — adds complexity this project doesn't need.
- Endpoints are versioned from day one: `/api/v1/...`.
- Every mutating endpoint (`POST`/`PATCH`/`DELETE`) validates its input
  with a schema validator (e.g. Zod) before touching the database.
- Errors return a consistent shape: `{ error: { code, message } }`. Never
  leak raw database errors or stack traces to the client.

## 6. Payments & money handling

- All payment operations go through Stripe's SDK — never hand-roll card
  handling, never log full card numbers or Stripe secrets.
- Every payment-affecting code path must be idempotent — Stripe webhooks
  can and will be delivered more than once. Use Stripe event IDs to
  dedupe.
- Currency is always explicit (`MXN`) — never assumed from context.
- Webhook signatures are always verified before processing a Stripe
  event.

## 7. Secrets & config

- No secrets in source control, ever — `.env` files are gitignored, and
  a `.env.example` with placeholder keys is committed instead.
- All environment variables are validated at startup (fail fast if a
  required key is missing) rather than failing later mid-request.

## 8. Testing

- Unit tests for all business logic that isn't trivial glue — especially
  capacity-slot booking, no-show logic, and price calculation.
- Integration tests for the full order-placement flow (place order →
  capacity check → payment → confirmation), since this is the path where
  a bug is most costly.
- No PR merges to `main` with failing tests or failing lint.

## 9. Git & PR workflow

- Trunk-based: short-lived feature branches off `main`, merged via PR.
- Commit messages: imperative mood, present tense (`Add capacity check to
  order endpoint`, not `Added` or `Adding`).
- PRs should be small enough to review in one sitting. If a PR touches
  both the schema and unrelated UI, split it.
- Any change to the data model or a significant architectural choice
  (e.g. adding a new payment method, changing the capacity model) gets an
  ADR — see `adr_template.md`.

## 10. Logging & observability

- Structured logs (JSON), not `console.log` strings, in production.
- Log order state transitions (created → confirmed → preparing → ready →
  picked_up / no_show) — this is the audit trail you'll want when a
  customer disputes an order.
- Never log phone numbers or payment details in full — mask them
  (e.g. last 4 digits only), consistent with how they're displayed on the
  store screen.

## 11. Accessibility & mobile

- Customer app must be usable one-handed on a phone — most orders will
  come from students on mobile between classes.
- Store screen should be legible at a glance from a few feet away
  (large text, high contrast) — staff are reading it while working.