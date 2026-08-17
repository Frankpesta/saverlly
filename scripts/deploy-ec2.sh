#!/usr/bin/env bash
# Run this ON the EC2 box (over SSH) from the repo root to deploy/redeploy the backend.
# First-time setup (Docker install, .env.production, security groups) is in DEPLOYMENT.md —
# this script only covers the repeatable "ship new code" step.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Pulling latest code"
git pull

echo "==> Building and starting containers"
docker compose -f docker-compose.prod.yml up -d --build

echo "==> Waiting for backend container to be healthy"
until [ "$(docker inspect -f '{{.State.Health.Status}}' saverlly-backend 2>/dev/null)" = "healthy" ]; do
  sleep 3
done

echo "==> Running database migrations"
docker compose -f docker-compose.prod.yml exec -T backend npm run prisma:deploy

echo "==> Done. Verify with: curl http://localhost:3000/health"
