# Backend and agent reliability fixes

## Financial records and payouts

Device removal now retires the device and revokes its tokens. Attribution and commission records remain available for settlement. Deleting a merchant, location, or kiosk with financial or attribution history is rejected; deactivate it instead.

Conversion ingestion supports multiple orders for one attribution sub-ID, deduplicates by merchant and network reference, and paginates beyond 500 rows. Reconciliation checks both pending and confirmed conversions. A reversal reduces an unprocessed payout; a reversal after processing creates a unique negative adjustment against future earnings. Transactions serialize payout allocation, reversal handling, and transfer claims.

Stripe transfer requests freeze the destination and amount and include the payout ID in metadata. Webhooks can match a transfer before its ID has been saved locally. An uncertain transfer stays `PROCESSING`; recovery checks Stripe before retrying the same request. Recovery runs every five minutes and is also available through **Recover transfer** in the admin payout list or `POST /payouts/:id/recover`.

Automatic creation retries stop 23 hours after the original claim. Stripe can remove idempotency keys after 24 hours, so older unresolved requests require an administrator to reconcile the transfer in Stripe. Legacy processing payouts without a saved transfer ID or frozen request identity also require manual reconciliation. See [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests).

## Affiliate approval prerequisite

There are no approved affiliate networks yet. Unsupported networks fail explicitly instead of silently selecting the mock adapter. Mock mode only supports the network named `Mock`, requires its existing environment flag, and is disabled in production. Mock commissions are marked as test data and excluded from payable balances and transfers, including legacy `MOCKCONV-` records.

Live adapters, provider-specific credentials, conversion verification, and end-to-end network settlement remain dependent on network approval and API access. Do not treat mock tests as evidence of a working live integration.

## Scraping and checkout

Automated observations preserve manual coupon metadata and never reactivate a disabled coupon. Editing coupon metadata makes it manually managed. Automated coupons expire from delivery unless observed again within seven days or twice the source interval, whichever is longer; the coupon's explicit expiry still applies. Existing automated rows receive a seven-day migration grace period.

Scrape sources persist the latest error, code count, and last successful run, surfaced in admin pages. Extraction and reveal failures fail the job visibly, including empty results, while retaining any successfully observed codes.

Checkout recipes require coupon input, apply button, cart total, and checkout URL patterns. CSS selector validation rejects malformed or unsupported selector syntax. The extension rechecks a winning coupon's actual total, tries a cheaper known alternative after repricing, and restores the shopper's original discount if the result becomes worse. Unstable comparisons are not reported as fully verified.

## Agent startup

An initial announcement or sync failure no longer prevents recurring sync. Sync cycles cannot overlap. Completing installer setup starts the scheduled agent task immediately instead of waiting for the next logon.

## Deployment and verification

Apply both migrations before starting the updated backend:

```powershell
npm run prisma:deploy --workspace=@saverlly/backend
npm run prisma:generate --workspace=@saverlly/backend
```

The migrations add retirement, reconciliation, test-data, payout recovery, reversal adjustment, coupon freshness, and scrape health fields. They remove the unique constraint on commission sub-IDs while retaining merchant/network-reference deduplication. These changes preserve existing financial rows.

`apps/backend/scripts/test-reliability.js` creates and migrates the separate local `saverlly_reliability_test` database and uses Redis database 2. It does not reset the application database. Run from `apps/backend`:

```powershell
node scripts/test-reliability.js
```

Regression coverage includes concurrent conversion ingestion and payout generation, a 501-row reconciliation backlog, later reversals, mock payment exclusion, early webhooks, interrupted transfers, stale retry prevention, coupon preservation, retirement, and affiliate sub-ID persistence. Browser scraper and extension tests use local fixtures; Stripe tests use mocked responses, not real transfers.

Verified on September 21, 2026: 78 backend unit tests, 95 affected backend integration tests, 132 agent tests, 135 extension tests, and 15 affected dashboard tests passed. Backend and dashboard TypeScript checks passed. Both migrations were applied successfully to the isolated test database; the application database has not been migrated by this task. The updated agent and extension still need to be packaged and distributed through the normal release process.
