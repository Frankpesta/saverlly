# Local development setup

Everything runs on your machine: Postgres and Redis in Docker, the backend and dashboard with
npm. Production deployment is covered separately in [DEPLOYMENT.md](../DEPLOYMENT.md).

## 1. One-time prerequisites

- **Node.js** (the repo uses npm workspaces; `npm install` at the repo root installs every app).
- **Docker Desktop**, with WSL 2 working. If Docker Desktop says it is "unable to start", run
  `wsl --update` in an **administrator** PowerShell, reboot, then start Docker Desktop again.

## 2. First run

```bash
# repo root
npm install
docker compose up -d                 # Postgres :5432 and Redis :6379

# environment files (only if they don't exist yet, see section 4)
cp apps/backend/.env.example apps/backend/.env
cp apps/dashboard/.env.example apps/dashboard/.env.local

# database: apply every migration, then seed demo data and logins
npm run db:setup -w @saverlly/backend
```

## 3. Every day

```bash
docker compose up -d                          # if Docker was restarted
npm run start:dev -w @saverlly/backend        # API on http://localhost:3000 (docs at /api/docs)
npm run dev -w @saverlly/dashboard            # dashboard on http://localhost:3001
```

### Seeded logins

All passwords are `Saverlly!2026` (override with `SEED_PASSWORD=... npm run prisma:seed`).

| Role | URL | Email |
| --- | --- | --- |
| Admin | http://localhost:3001/admin/login | `admin@saverlly.local` |
| Kiosk owner | http://localhost:3001/portal/login | `owner@saverlly.local` |
| Location manager (Main Street only) | http://localhost:3001/portal/login | `manager@saverlly.local` |

The seed also creates the "Downtown Kiosks" kiosk with two Texas locations, one merchant
(`allbirds.com`) with three coupons, an Impact affiliate program, and agent setup codes
`DEVSTRT2` (Main Street) and `DEVMXPK3` (Mall Food Court).

The seed is safe to re-run, it upserts and never duplicates rows. It refuses to run when
`NODE_ENV=production`.

### Useful database commands (from `apps/backend`)

| Command | What it does |
| --- | --- |
| `npm run prisma:seed` | Re-run the seed |
| `npm run prisma:migrate` | Create/apply a new migration after editing `schema.prisma` |
| `npm run prisma:studio` | Browse the database in the browser |
| `npx prisma migrate reset` | **Wipe** the dev database, re-apply migrations and re-seed |

## 4. Environment variables

### Backend: `apps/backend/.env`

Required to boot:

| Variable | Local value | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://saverlly:saverlly_dev_password@localhost:5432/saverlly?schema=public` | Matches `docker-compose.yml` |
| `REDIS_URL` | `redis://localhost:6379` | Background jobs (BullMQ) |
| `JWT_ACCESS_SECRET` | long random string | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `JWT_REFRESH_SECRET` | different long random string | Same command |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | |
| `JWT_REFRESH_EXPIRES_IN` | `30d` | |
| `ENCRYPTION_KEY` | 32 random bytes, base64 | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Encrypts affiliate API credentials. **Never change it once real credentials are stored** |
| `STRIPE_WEBHOOK_SECRET` | any value locally | Real `whsec_...` from Stripe in production |
| `STRIPE_CONNECT_RETURN_URL` | `http://localhost:3001/portal/earnings` | |
| `STRIPE_CONNECT_REFRESH_URL` | `http://localhost:3001/portal/earnings` | |

Optional:

| Variable | Default / local | Notes |
| --- | --- | --- |
| `PORT` | `3000` | |
| `PUBLIC_BACKEND_URL` | `http://localhost:3000` | Absolute URLs for uploaded images and avatars |
| `DASHBOARD_BASE_URL` | `http://localhost:3001` | Links inside emails |
| `STRIPE_SECRET_KEY` | empty | Stripe test key (`sk_test_...`) to try payouts/onboarding |
| `RESEND_API_KEY` | empty | Empty logs emails to the console instead of sending them |
| `EMAIL_FROM_ADDRESS` | `Saverlly <onboarding@resend.dev>` | |
| `SUPPORT_EMAIL` | empty | Initial support address; admins change it in Settings > Platform |
| `AFFILIATE_MOCK_ADAPTERS_ENABLED` | `true` locally | **Unset in production** |
| `COMMISSION_PENDING_WINDOW_DAYS` | `90` | |
| `PAYOUT_AGGREGATION_INTERVAL_DAYS` | `30` | |
| `AGENT_DOWNLOAD_URL` / `AGENT_RELEASE_DIR` / `AGENT_RELEASE_VERSION` | empty / `../agent/release` / `0.1.0` | Where "Download Agent" gets the installer |
| `SENTRY_DSN` | empty | Error tracking off when empty |

`.env.test` (already committed) is used by the e2e tests against a separate `saverlly_test`
database.

### Dashboard: `apps/dashboard/.env.local`

| Variable | Local value | Notes |
| --- | --- | --- |
| `BACKEND_API_URL` | `http://localhost:3000` | Server-side only; the browser talks to the dashboard's `/api/proxy` |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | empty | Optional |

### Extension: build-time only (`apps/extension`)

Every build bakes in a backend address, used whenever the desktop agent hasn't supplied one
(admin laptops, reviewers). `npm run build` and `npm run build:reviewers` bake in the live
backend; `npm run build:local` and `npm run dev` bake in `http://localhost:3000`.

| Variable | Notes |
| --- | --- |
| `SAVERLLY_API_URL` | Overrides the baked-in backend for any build. Must be HTTPS, localhost, or the approved live origin |
| `SAVERLLY_REVIEWER_API_URL` | Older name for `SAVERLLY_API_URL` that also turns reviewer access on |

Load it in Chrome via `chrome://extensions` > Developer mode > **Load unpacked** >
`apps/extension/dist` (after `npm run build:local -w @saverlly/extension`).

### Desktop agent (`apps/agent`)

| Variable | When | Notes |
| --- | --- | --- |
| `SAVERLLY_API_BASE_URL` | build time (baked in) | Defaults to `http://localhost:3000` |
| `SAVERLLY_EXTENSION_ID` | build time (baked in) | **Required** for force-install. The id Chrome shows for the extension |
| `SAVERLLY_EXTENSION_UPDATE_URL` | build time (baked in) | Defaults to the Chrome Web Store update URL |
| `SAVERLLY_SETUP_CODE` | runtime, per install | Location setup code, e.g. `DEVSTRT2` from the seed. Prompted for if unset |
