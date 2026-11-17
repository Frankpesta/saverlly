-- Built-in scrapers per coupon site, a status separate from the active switch, and scheduling
-- from the database (nextRunAt) instead of one BullMQ repeat job per source.

CREATE TYPE "ScrapeStrategy" AS ENUM ('GENERIC_CSS', 'SIMPLYCODES', 'COUPONFOLLOW');
CREATE TYPE "ScrapeSourceStatus" AS ENUM ('ACTIVE', 'NOT_LISTED', 'BLOCKED');

ALTER TABLE "ScrapeSource"
  ADD COLUMN "strategy" "ScrapeStrategy" NOT NULL DEFAULT 'GENERIC_CSS',
  ADD COLUMN "status" "ScrapeSourceStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "nextRunAt" TIMESTAMP(3),
  ADD COLUMN "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "autoCreated" BOOLEAN NOT NULL DEFAULT false,
  ALTER COLUMN "selectorConfig" DROP NOT NULL;

-- Existing SimplyCodes store sources move to the built-in strategy (their selectors stay as
-- overrides). Only one per merchant can: any extra duplicates stay GENERIC_CSS, which still
-- routes simplycodes.com store pages through the same collector, so nothing stops working.
UPDATE "ScrapeSource" s
SET "strategy" = 'SIMPLYCODES'
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "merchantId" ORDER BY "id") AS rn
  FROM "ScrapeSource"
  WHERE "merchantId" IS NOT NULL
    AND "url" ~ '^https://simplycodes\.com/store/[^/?#]+/?$'
    AND "selectorConfig" ? 'revealSelector'
    AND NOT ("selectorConfig" ? 'rowSelector')
) ranked
WHERE s."id" = ranked."id" AND ranked.rn = 1;

-- Spread existing sources' first run over their interval (capped at a day) instead of
-- running every one the moment the new dispatcher starts.
UPDATE "ScrapeSource"
SET "nextRunAt" = CURRENT_TIMESTAMP
  + (random() * LEAST("intervalMinutes", 1440)) * INTERVAL '1 minute';

CREATE UNIQUE INDEX "ScrapeSource_merchantId_strategy_site_key"
  ON "ScrapeSource"("merchantId", "strategy")
  WHERE "strategy" <> 'GENERIC_CSS';

CREATE INDEX "ScrapeSource_active_nextRunAt_idx" ON "ScrapeSource"("active", "nextRunAt");
