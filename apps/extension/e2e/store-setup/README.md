# Store setup: real-browser tests

A Playwright suite for Easy Store Setup. It runs in Chromium with the built extension loaded. Each test serves its own small test store on `localhost`, drives the setup panel the way an admin would, and checks what happened.

The setup panel lives in a **closed** shadow root, so ordinary Playwright locators can't see inside it. The `setupPanel` driver in `fixtures.ts` reaches it through the Chrome DevTools Protocol call `DOM.getDocument({ pierce: true })`. It reads text with `DOM.resolveNode` and clicks real mouse coordinates from `DOM.getBoxModel`.

| Spec | Covers |
| --- | --- |
| `panel.e2e.ts` | Starting setup from the popup. The panel on a store with hostile `!important` CSS. Pick mode, where the store sees no events. Resuming after a reload. A click into a cross-origin payment frame. Moving and stopping the panel. |
| `steps.e2e.ts` | A Shopify-style store through all eight steps: the picks, learning the error message, and a working code (`SAVE10`) with removal proven, ending in a passing final test. A WooCommerce-classic store that reloads the page to answer a code: the error message is found on the reloaded page, and the final test fails with a plain explanation. |
| `one-code-store.e2e.ts` | A store that holds one code at a time and hides its promo box until the code is removed. When removal restores the total, comparing codes is switched on. When it doesn't, comparing stays off and the admin is told the code is still applied. |
| `full-system.e2e.ts` | Opt-in. Dashboard code → options-page redeem → all eight steps → send → dashboard **Save recipe to store**. The backend must then hold exactly the tested recipe. |

The test stores are in `stores.ts`.

## Running

From `apps/extension`:

```sh
npm run build
npx playwright install chromium   # once
npm run test:e2e
```

Each test gets its own Chromium profile and its own stores on free ports, so the tests run in parallel. Results and the HTML report go to `coverage/extension-e2e/`, which is git-ignored. Open the report with `npx playwright show-report ../../coverage/extension-e2e/report`. It includes the screenshots the tests take along the way, and a trace for any failure.

You can set these environment variables:
- `SETUP_E2E_EXTENSION`: the unpacked extension folder (default `apps/extension/dist`)
- `SETUP_E2E_HEADED=1`: show the browser

CI runs everything except the full-system test on every pull request that touches the extension or shared types. See `.github/workflows/extension-e2e.yml`.

## Running `full-system.e2e.ts`

This test needs the real backend and dashboard. Run them against a **throwaway** database, never your dev or production one, because the seed creates an admin and a store on `localhost`.

On this machine, a Windows Postgres service already holds port 5432. So use a temporary container on another port:

```sh
docker run -d --rm --name saverlly-setup-e2e-pg -p 55440:5432 \
  -e POSTGRES_USER=saverlly -e POSTGRES_PASSWORD=e2e_only -e POSTGRES_DB=saverlly_setup_e2e postgres:16-alpine
export DATABASE_URL="postgresql://saverlly:e2e_only@127.0.0.1:55440/saverlly_setup_e2e?schema=public"

cd apps/backend
npx prisma migrate deploy
export SETUP_E2E_MERCHANT_ID=$(node ../extension/e2e/store-setup/seed-full-system.js)
npm run build && PORT=3000 node dist/src/main &            # backend
(cd ../dashboard && BACKEND_API_URL=http://127.0.0.1:3000 npx next dev -p 3001) &   # dashboard

cd ../extension && npm run build
npx playwright test full-system
```

`SETUP_E2E_DASHBOARD` and `SETUP_E2E_API` override the dashboard and backend addresses. The defaults are `http://localhost:3001` and `http://127.0.0.1:3000`.

When you're done, stop the backend and the dashboard, then run `docker stop saverlly-setup-e2e-pg`.

Before starting, check that ports `3000` and `3001` are free. A dashboard started with `npx next dev` can leave its Next.js server running after the outer process stops, and a stale server on `3001` will serve an old build.
