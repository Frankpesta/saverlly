# Single-stage build for a testing-environment deploy: correctness and simplicity over image
# size. Based on the official Playwright image (not plain node:22) so the OS-level Chromium
# dependencies needed by the in-process scraping job (BullMQ processor using `playwright`)
# are already present and match the exact `playwright` version pinned in package-lock.json —
# npm's `postinstall: playwright install chromium` step becomes a no-op against browsers this
# base image already ships. Revisit as a slimmer multi-stage build once this graduates past
# a single-EC2-instance testing setup.
#
# Build context MUST be the repo root (npm workspaces — the lockfile lives there), e.g.:
#   docker build -f apps/backend/Dockerfile -t saverlly-backend .
FROM mcr.microsoft.com/playwright:v1.62.1-noble

WORKDIR /app

# Copy every workspace's package.json first (npm needs them all present to satisfy the
# root package-lock.json, even though @saverlly/backend itself has no workspace: deps) so
# this layer only invalidates when a dependency actually changes, not on every source edit.
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY apps/extension/package.json apps/extension/package.json
COPY apps/agent/package.json apps/agent/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json

RUN npm ci

COPY apps/backend apps/backend

WORKDIR /app/apps/backend
RUN npx prisma generate
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "run", "start:prod"]
