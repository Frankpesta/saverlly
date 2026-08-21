# Deploying Saverlly for end-to-end testing

This is a from-scratch runbook for standing up a real, reachable Saverlly environment on your
own AWS + Vercel accounts — for internal end-to-end testing, not hardened production. Follow it
top to bottom; later steps depend on earlier ones (the extension must be published before the
final agent build, for example).

## Architecture

```
                         ┌─────────────────────┐
   Browser / kiosk PC    │   Vercel             │
   ┌────────────────┐    │   apps/dashboard      │
   │ Chrome extension│    │   (Next.js, BFF proxy)│
   │ Desktop agent   │    └──────────┬────────────┘
   └───────┬─────────┘               │ server-to-server (BACKEND_API_URL)
           │ direct HTTP              │
           ▼                          ▼
   ┌───────────────────────────────────────────┐
   │  EC2 instance (t3.medium, Elastic IP)       │
   │  docker-compose.prod.yml                     │
   │  ┌────────────┐   ┌───────────┐             │
   │  │  backend    │──▶│  redis    │             │
   │  │  (NestJS)   │   └───────────┘             │
   │  └─────┬──────┘                              │
   └────────┼──────────────────────────────────────┘
            │
            ▼
   ┌─────────────────┐        ┌──────────────────────┐
   │  RDS Postgres 16  │        │  S3 (agent releases)  │
   └─────────────────┘        └──────────────────────┘
```

- **Backend**: containerized NestJS on a single EC2 box (Docker Compose), talking to a managed
  RDS Postgres instance. Redis runs as a sibling container on the same box.
- **Dashboard**: Next.js on Vercel. Its server (not the browser) calls the backend directly over
  plain HTTP — see "Known limitations" for why HTTPS isn't set up yet.
- **Chrome extension**: published to the Chrome Web Store, same as any real install.
- **Desktop agent**: built locally, `.exe` uploaded to S3, linked from the dashboard.

## Prerequisites

- An AWS account with console + CLI access (`aws configure` already run locally)
- A Vercel account with this repo accessible (GitHub App installed, or manual import)
- An SSH key pair for EC2 (create one in the EC2 console if you don't have one: **Key Pairs** →
  **Create key pair**, download the `.pem`)
- A Chrome Web Store developer account ($5 one-time registration fee if you don't already have
  one)
- Docker installed locally (used to test the image build before shipping it to EC2)

---

## Part A — AWS infrastructure

### A1. RDS Postgres

Console: **RDS** → **Create database**
- Engine: PostgreSQL, version **16.x** (matches the Postgres version used in local dev)
- Templates: Free tier or Dev/Test
- DB instance identifier: `saverlly-db`
- Master username: `saverlly`, generate/set a strong password (save it — you'll need it for
  `DATABASE_URL`)
- Instance class: `db.t4g.micro` (or `db.t3.micro` if `t4g`/ARM isn't available in your region)
- Storage: 20 GiB gp3
- Connectivity: use the **default VPC**, **do not** make it publicly accessible
- Create a new security group `saverlly-db-sg` (or reuse one) — you'll open port 5432 on it to
  the EC2 instance's security group once that exists (A2)
- Initial database name: `saverlly`

Wait for it to reach "Available", then note its **Endpoint** (under Connectivity & security) —
this becomes part of `DATABASE_URL`.

### A2. EC2 instance

Console: **EC2** → **Launch instance**
- Name: `saverlly-backend`
- AMI: **Ubuntu Server 24.04 LTS** (amd64)
- Instance type: `t3.medium`
- Key pair: the one from Prerequisites
- Network: default VPC, **create a new security group** `saverlly-backend-sg`:
  - Inbound: SSH (22) from **0.0.0.0/0**, Custom TCP (3000) from **0.0.0.0/0** (the backend
    itself — no domain/HTTPS yet, see "Known limitations")
  - Outbound: all traffic (default)
- Storage: 20 GiB gp3 is plenty

**Why SSH is open to the world, not just your IP**: this deploy uses GitHub Actions to SSH in
and trigger redeploys on every push (see A4 below, and "Known limitations" for the workflow's
current status), and GitHub-hosted runners don't have a
fixed IP range that's practical to allowlist. Security relies entirely on key-based auth (no
password auth, which is Ubuntu's default anyway) — never enable password SSH login on this box.
If GitHub Actions ever moves to a self-hosted runner inside your VPC, or you switch to AWS SSM
Session Manager instead of SSH, this can be tightened back down to your own IP.

After it's running: **Elastic IPs** → **Allocate Elastic IP address** → **Associate** it with
this instance. Note the IP — every URL below uses `<elastic-ip>`.

Now go back to A1's `saverlly-db-sg` and add an inbound rule: PostgreSQL (5432), source =
`saverlly-backend-sg` (select the security group, not an IP) — this is what lets the backend
reach RDS while keeping RDS unreachable from the internet.

### A3. Bootstrap the EC2 box

SSH in and install Docker:

```bash
ssh -i /path/to/key.pem ubuntu@<elastic-ip>

curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
# log out and back in for the group change to take effect
exit
ssh -i /path/to/key.pem ubuntu@<elastic-ip>
docker --version
docker compose version
```

Install git and clone the repo:

```bash
sudo apt-get update && sudo apt-get install -y git
git clone <your-repo-url> saverlly
cd saverlly
```

### A4. Add a dedicated deploy key for GitHub Actions

Don't reuse your personal key for CI. Generate a separate keypair **on your own machine**:

```bash
ssh-keygen -t ed25519 -f ./saverlly-ci-deploy -C "github-actions-deploy" -N ""
```

This produces `saverlly-ci-deploy` (private) and `saverlly-ci-deploy.pub` (public). Append the
public half to the EC2 box's authorized keys:

```bash
cat saverlly-ci-deploy.pub | ssh -i /path/to/key.pem ubuntu@<elastic-ip> "cat >> ~/.ssh/authorized_keys"
```

Keep `saverlly-ci-deploy` (the private key) — it becomes a GitHub Actions secret once the
workflow is set up (not covered in this doc yet; ask for it when you're ready to wire up the
actual `.github/workflows/deploy.yml`). Don't commit either file to the repo.

### A5. S3 bucket for agent releases

```bash
aws s3api create-bucket --bucket saverlly-agent-releases --region us-east-1
```
(pick your own bucket name/region — it must be globally unique; adjust every command below to
match)

Allow public read on just the `agent/` prefix — **Permissions** tab → **Bucket policy**:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadAgentReleases",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::saverlly-agent-releases/agent/*"
    }
  ]
}
```
You'll also need to disable "Block all public access" for this bucket (**Permissions** →
**Block public access** → uncheck, since the default blocks even a scoped bucket policy).

---

## Part B — Deploy the backend

On the EC2 box, inside the cloned `saverlly` repo:

```bash
cp apps/backend/.env.production.example apps/backend/.env.production
nano apps/backend/.env.production   # fill in DATABASE_URL, generate real secrets, etc.
```

Generate secrets locally (or on the box) rather than leaving the placeholders:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```
Run it twice — once for `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` (can share or use separate
values), once for `ENCRYPTION_KEY`.

Set `PUBLIC_BACKEND_URL="http://<elastic-ip>:3000"`. Leave `STRIPE_CONNECT_RETURN_URL`,
`STRIPE_CONNECT_REFRESH_URL`, and `DASHBOARD_BASE_URL` pointing at placeholders for now — you'll
come back and fill in the real Vercel domain after Part C.

Deploy:
```bash
chmod +x scripts/deploy-ec2.sh
./scripts/deploy-ec2.sh
```
This builds the image, starts `backend` + `redis`, waits for the health check, then runs
`prisma migrate deploy` against RDS.

Verify:
```bash
curl http://localhost:3000/health
# from your own machine:
curl http://<elastic-ip>:3000/health
```
Both should return `{"status":"ok","db":"connected"}`. If the second one fails but the first
works, double-check the EC2 security group's inbound rule for port 3000.

---

## Part C — Deploy the dashboard to Vercel

1. **New Project** → import this repo
2. **Root Directory**: `apps/dashboard` (Vercel auto-detects Next.js + Turborepo)
3. Environment variables:
   - `BACKEND_API_URL` = `http://<elastic-ip>:3000`
   - `NEXT_PUBLIC_AGENT_DOWNLOAD_URL` — leave unset for now, come back after Part E
4. Deploy. Note the resulting `*.vercel.app` domain.

Now go back to the EC2 box and update `apps/backend/.env.production`:
```
STRIPE_CONNECT_RETURN_URL="https://<your-app>.vercel.app/portal/earnings"
STRIPE_CONNECT_REFRESH_URL="https://<your-app>.vercel.app/portal/earnings"
DASHBOARD_BASE_URL="https://<your-app>.vercel.app"
```
Re-run `./scripts/deploy-ec2.sh` to pick up the change (it's a no-op git pull if you edited the
file directly on the box — just rebuilds/restarts the container with the new env).

---

## Part D — Publish the Chrome extension

```bash
cd apps/extension
npm run package
```
Produces `release/saverlly-extension-v<version>.zip`. Submit it via the
[Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) — new
item, upload the zip, fill in the listing, submit for review. Once approved, copy the
**extension ID** from its store URL (`https://chromewebstore.google.com/detail/<id>`) — you need
it for Part E.

---

## Part E — Build and upload the desktop agent

Now that you have the real backend URL and the real extension ID:

Requires [Inno Setup](https://jrsoftware.org/isdl.php) on the build machine (`winget install
JRSoftware.InnoSetup`) — `npm run package` compiles a branded GUI installer via its `ISCC.exe`
compiler in addition to the two raw exes.

```bash
cd apps/agent
SAVERLLY_API_BASE_URL="http://<elastic-ip>:3000" \
SAVERLLY_EXTENSION_ID="<real-extension-id-from-part-d>" \
npm run package
```
Produces `release/saverlly-agent.exe` + `release/saverlly-agent-host.exe` (the two exes — the
second is Chrome's native-messaging target, never run directly, see
`apps/agent/src/lib/native-messaging-host.ts`), and `release/SaverllyAgentSetup.exe` — **this is
the file to distribute**: a single branded installer (one UAC prompt, a wizard page asking for
the location's setup code, then done — no manual zip extraction, no console window). It also
registers a proper Add/Remove Programs uninstall entry that cleans up the scheduled task and
registry keys. `release/saverlly-agent-bundle.zip` (both raw exes zipped together) is also
produced as a manual/troubleshooting fallback, not what gets linked from the dashboard.

Upload the installer:
```bash
aws s3 cp release/SaverllyAgentSetup.exe s3://saverlly-agent-releases/agent/SaverllyAgentSetup.exe --acl public-read
```
Download URL: `https://saverlly-agent-releases.s3.<region>.amazonaws.com/agent/SaverllyAgentSetup.exe`

Go back to the Vercel project settings and set `NEXT_PUBLIC_AGENT_DOWNLOAD_URL` to that URL,
then redeploy (Vercel → Deployments → ⋯ → Redeploy, since `NEXT_PUBLIC_*` vars are baked in at
build time).

The "Download Agent" button on `/portal/devices` now links straight to S3 instead of showing the
placeholder toast.

---

## Part F — End-to-end smoke test

1. Log into the deployed dashboard (`https://<your-app>.vercel.app/admin/login`)
2. Create a kiosk, confirm the generated owner password flow works
3. Log in as the kiosk owner, upload an announcement image — confirms the Docker volume +
   static file serving survive a real request
4. From `/portal/devices`, click **Download Agent** — confirms the S3 link works
5. Load the real unpacked/published extension in Chrome, confirm it can reach the deployed
   backend (check the service worker's devtools console for fetch errors)

---

## Redeploying later

Whenever you push new backend code:
```bash
ssh -i /path/to/key.pem ubuntu@<elastic-ip>
cd saverlly && ./scripts/deploy-ec2.sh
```
Dashboard redeploys are automatic on every push to the connected branch (standard Vercel
behavior) — no manual step needed.

---

## Known limitations (deliberate, for this testing pass)

- **Plain HTTP, no domain**: the backend has no TLS. Fine for internal testing since the
  dashboard's server (not the browser) talks to it, but revisit once a real domain exists —
  adding HTTPS later (e.g. a Caddy or nginx reverse-proxy container with Let's Encrypt) needs no
  application code changes, just a new container in front of `backend` in
  `docker-compose.prod.yml`.
- **Uploads on a Docker volume, not S3**: announcement images persist across container
  rebuilds/restarts via the `saverlly-uploads-data` volume, but would be lost if the EC2
  instance itself were ever terminated and replaced. Migrate to S3 before any real
  multi-instance production setup.
- **Single EC2 instance**: no auto-scaling, no failover, no managed backups beyond whatever RDS
  automated backups you leave enabled. Fine for one team testing; not a production topology.
- **CI/CD groundwork laid, workflow not written yet**: the EC2 box's security group and the A4
  deploy key are set up so GitHub Actions can SSH in and run `scripts/deploy-ec2.sh`, but the
  actual `.github/workflows/deploy.yml` doesn't exist yet — deploys are still the manual script
  run over SSH until that's written.
- **Redis has no durable backup** — acceptable since it's only used for BullMQ job queues here,
  not primary data.
- **Agent has no auto-update mechanism** — a new agent version means re-running Part E and
  getting kiosk owners to redownload/reinstall manually. Pre-existing gap, not introduced by
  this deploy.
- **Stripe/Resend still need real test-mode credentials** to actually send payouts/emails — both
  degrade gracefully when unset (Stripe calls fail explicitly, emails log instead of sending),
  same as local dev.
- **Agent `.exe` is unsigned** — Chrome's download protection and Windows SmartScreen both flag
  it (low-reputation/unknown-publisher heuristic, not a detection of anything actually wrong with
  the file). Real fix is an Authenticode code-signing certificate from a CA (paid, requires
  identity verification, takes days) wired into `scripts/package.js`. Until then, installing it
  requires clicking through both warnings once ("Keep" in Chrome's download bar, "More info" →
  "Run anyway" in the SmartScreen dialog) — acceptable for kiosk devices you control, not for a
  general public download.
- **Resolved**: first run used to require an interactive console prompt for the setup code
  (`apps/agent/src/lib/registration.ts`'s `readline` fallback) — easy to miss behind other
  windows after the UAC prompt, not obvious to a non-technical kiosk operator that a console
  window was even part of the flow. `SaverllyAgentSetup.exe` now collects the setup code via a
  proper wizard page and passes it through (`--setup-once --setup-code=...`, see
  `apps/agent/src/lib/installer-mode.ts`) — no console window is ever shown. The direct exe still
  falls back to the interactive prompt if run manually without a setup code, which is fine for
  troubleshooting but not the distributed path anymore.
- **`SaverllyAgentSetup.exe` is unsigned, same as the two exes it contains** — SmartScreen now
  flags the installer itself (the first thing a kiosk owner sees) rather than a raw exe;
  functionally the same gap as the bullet above, just a different file triggering it. Same real
  fix (a code-signing cert wired into `scripts/package.js` before `ISCC.exe` runs).
