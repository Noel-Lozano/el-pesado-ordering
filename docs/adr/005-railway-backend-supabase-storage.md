# ADR-005: Backend on Railway, menu photos in Supabase Storage

**Status:** Accepted

**Date:** 2026-11-11

**Deciders:** Noel Lozano

## Context

`architecture.md` §2 left two infrastructure choices open:

- **Backend hosting:** "Railway or Render". Vercel's serverless model
  doesn't suit the store screen's long-running WebSocket, so the Express
  API needs a host built for always-on processes.
- **Menu photo storage:** "S3 or Cloudflare R2". ADR-004 left this as its
  only open question, because it decides the public hostname that
  `next.config.ts` must allow in `images.remotePatterns`.

Facts that bear on this:

- The database is already on Supabase (managed Postgres). Migrations
  `01` to `06` have run against it, and migration `04` enabled RLS on every
  public table to close the Supabase Data API.
- The backend is a single Express service (`backend/`), built with `tsc`
  and started with `node dist/index.js`. It must run Node 24
  (`engines` in `package.json`). Its config is validated at startup by
  `src/config/env.ts`, so a missing variable stops it right away.
- The backend sits behind the host's proxy. `app.ts` sets
  `trust proxy` to 1 so `req.ip` is the real client IP.
- CI (`.github/workflows/ci.yml`) runs type checks, unit tests and the
  integration tests against a throwaway Postgres on every PR into `main`.
- Photos are a few dozen menu images, uploaded by the owner, rarely
  changed, and read by every customer. `menu_items.image_url` holds a URL;
  images are never stored in Postgres (`architecture.md` §2). Every
  `image_url` is null today, and `seed-menu.ts` never overwrites it.
- There is no admin UI or upload endpoint yet. The team is one developer.

## Decision

We will host the backend on **Railway**, deployed from the `backend/`
folder of this repo, with migrations run as Railway's pre-deploy step.

We will store menu photos in a public **Supabase Storage** bucket named
`menu-images` in the same Supabase project as the database. Each
`menu_items.image_url` holds the object's full public URL:

```
https://<project-ref>.supabase.co/storage/v1/object/public/menu-images/<file>
```

## Options considered

### Option A — Railway for the backend (chosen)
- Pros: always-on service with no sleep on idle, so no cold start for the
  first lunch order. WebSockets work without extra setup. Has a
  pre-deploy command for migrations, and can wait for GitHub CI to pass
  before deploying. Usage-based pricing fits one small service.
- Cons: usage-based billing is less predictable than a flat price. One
  more vendor account alongside Vercel and Supabase.

### Option B — Render for the backend
- Pros: similar feature set; flat monthly price on paid plans.
- Cons: the free tier sleeps after inactivity, so a real deployment needs
  the paid plan anyway. No advantage over Railway for this app.

### Option C — Supabase Storage for photos (chosen)
- Pros: the Supabase project already exists, so there is no new vendor,
  account, key or bill. The dashboard can upload files, which covers the
  owner adding photos before any admin UI exists. Public buckets serve
  files through Supabase's CDN with no access policy to write.
- Cons: egress beyond the plan quota costs more than R2, which charges
  nothing for egress. Ties photos to the same project as the database.

### Option D — Cloudflare R2 (or S3) for photos
- Pros: R2 has no egress fees. Fully separate from the database.
- Cons: a new account, API keys and bucket configuration for a few dozen
  images. No upload UI that suits the owner.

## Rationale

The complexity in this product is in the business rules, not the
infrastructure (`architecture.md` §1), so both choices pick the option
with the fewest moving parts.

**Railway:** the backend has to be always on because of the store
screen's WebSocket and the lunch rush. On Render that means paying for a
plan anyway, so the deciding factors are Railway's pre-deploy migrations
and its "wait for CI" option. Together with CI as a required check on
`main`, nothing reaches production without passing tests.

**Supabase Storage:** egress is the only real cost difference with R2,
and it barely applies here. The photos are few and small, and
`<MenuImage>` uses `next/image`, so Vercel resizes and caches them. Most
requests never reach the bucket. Avoiding a new vendor matters more for
one developer than saving on egress the app won't generate.

## Consequences

- **Easier:**
  - Photos can be added today by uploading in the Supabase dashboard and
    pasting the public URL into `menu_items.image_url`.
  - One fewer vendor. Database and photos share one project, and the
    backend needs no new credentials, since it only reads URLs.
  - Deploys are gated by CI, and migrations run before the new version
    starts.
- **Harder / debt:**
  - Supabase is now a single point of failure for both data and photos.
    If photos fail to load, `<MenuImage>` shows its placeholder, so the
    menu still works.
  - Railway's usage-based bill needs watching after launch.
  - When an upload endpoint is built, the backend will need
    `SUPABASE_URL` and a service-role key (server-side only, never in the
    frontend), plus Storage write policies or service-role uploads.
- **Setup to do:**
  - **Railway:** root directory `backend`, build `npm run build`, start
    `npm start`, pre-deploy `npx node-pg-migrate up`. Set every variable
    from `backend/.env.example`. `DATABASE_URL` is the Supabase Session
    Pooler string. `CORS_ORIGINS` includes the Vercel domain. Turn on
    "Wait for CI". `node-pg-migrate` is a devDependency, so check that it
    is still installed when the pre-deploy step runs.
  - **Supabase:** create the public `menu-images` bucket. Use stable
    lowercase file names (e.g. `burrito-frijoles-con-queso.webp`).
  - **Frontend:** add `<project-ref>.supabase.co`, path
    `/storage/v1/object/public/menu-images/**`, to `images.remotePatterns`
    in `next.config.ts`. This resolves ADR-004's open question.
- **Revisit if:**
  - photo egress exceeds the Supabase plan quota (move to R2 and rewrite
    `image_url` values);
  - Railway's monthly cost goes clearly above a flat-price plan elsewhere;
  - the backend needs more than one instance (the WebSocket design in
    `architecture.md` §2 would need revisiting first).

## Related

- `architecture.md` §2 (Object storage, Hosting): updated to these choices.
- ADR-004, "Resolved questions: Photos" and "Open questions": the
  provider and hostname are now chosen.
- ADR-002 decision 6 and ADR-004 (auth): the frontend (Vercel) and API
  (Railway) remain on different sites, so the `localStorage` JWT
  tradeoff stays as written.
