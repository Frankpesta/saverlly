#!/usr/bin/env bash
# Run this ON the deploy box (over SSH) from the repo root to deploy/redeploy the backend.
# First-time setup (Docker install, .env.production, security groups/firewall) is in
# DEPLOYMENT.md -- this script only covers the repeatable "ship new code" step. Despite the
# filename (kept for history -- this predates the move to a Hostinger VPS), nothing in here is
# AWS-specific: it's plain docker compose + ssh, so it works unchanged on any box with Docker.
set -euo pipefail

cd "$(dirname "$0")/.."

# Prevents two deploys from ever running at once on this box. Without this, a slow/stuck
# deploy (e.g. the health-wait loop below hanging) plus a second triggered run (a retry, a CI
# job once one exists, or just someone re-running by hand) pile up as zombie processes all
# fighting over the same containers -- exactly what happened before this script had a timeout
# at all. `flock -n` fails fast with a clear message instead of queuing silently.
LOCK_FILE="/tmp/saverlly-deploy.lock"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "==> Another deploy is already running (lock: $LOCK_FILE). Aborting." >&2
  exit 1
fi

echo "==> Pulling latest code"
git pull

echo "==> Building and starting containers"
docker compose -f docker-compose.prod.yml up -d --build

echo "==> Waiting for backend container to be healthy"
HEALTH_TIMEOUT_SECONDS=180
HEALTH_POLL_INTERVAL=3
elapsed=0
until [ "$(docker inspect -f '{{.State.Health.Status}}' saverlly-prod-backend 2>/dev/null)" = "healthy" ]; do
  if [ "$elapsed" -ge "$HEALTH_TIMEOUT_SECONDS" ]; then
    echo "==> Backend never became healthy after ${HEALTH_TIMEOUT_SECONDS}s. Last logs:" >&2
    docker compose -f docker-compose.prod.yml logs --tail=100 backend >&2
    echo "==> Stopping the unhealthy containers rather than leaving them running." >&2
    docker compose -f docker-compose.prod.yml down
    echo "==> Deploy failed and was rolled back to stopped. No migrations were run." >&2
    echo "==> To recover: fix the issue (or 'git checkout <last-good-sha>') and re-run this script." >&2
    exit 1
  fi
  sleep "$HEALTH_POLL_INTERVAL"
  elapsed=$((elapsed + HEALTH_POLL_INTERVAL))
done

echo "==> Running database migrations"
docker compose -f docker-compose.prod.yml exec -T backend npm run prisma:deploy

echo "==> Done. Verify with: curl http://localhost:3000/health"
