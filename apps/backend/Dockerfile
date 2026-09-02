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

# Copy every workspace's package.json first (npm needs them all present to satisfy the root
# package-lock.json) so this layer only invalidates when a dependency actually changes, not on
# every source edit.
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY apps/extension/package.json apps/extension/package.json
COPY apps/agent/package.json apps/agent/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json

RUN npm ci

# The backend imports @saverlly/shared-types (announcement-layout sanitizing), and npm ci only
# symlinks that workspace — it does not build it. Its package.json `main`/`types` point at
# `dist/`, which is both absent from the build context (`**/dist` is in .dockerignore) and
# gitignored, so without compiling it here the backend's own `npm run build` fails to resolve
# the import. Built before the backend is copied so an edit to backend source doesn't
# invalidate this layer.
#
# packages/config comes along because shared-types' tsconfig.json does `"extends":
# "../config/base.tsconfig.json"` — copying only the package.json of that workspace (as the
# npm ci layer above does) gets `tsc` far enough to start and then fail with TS5083. The
# extends chain ends there: base.tsconfig.json extends nothing, and the backend's own
# tsconfig.build.json only references its sibling tsconfig.json.
COPY packages/config packages/config
COPY packages/shared-types packages/shared-types
RUN npm run build --workspace @saverlly/shared-types

COPY apps/backend apps/backend

WORKDIR /app/apps/backend
RUN npx prisma generate
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "run", "start:prod"]
