-- Scraped/API coupons now stay offered for 20 days after a sync last saw them (was 7).
-- The scrapers are being blocked and can't refresh existing codes, so every existing scraped/API
-- code gets a fresh 20-day window from the moment this runs, however long ago it was last seen.
-- Only ever extends. Manual coupons (freshUntil NULL), the admin's active switch and real
-- expiry dates are untouched, so inactive or expired codes stay hidden.
UPDATE "Coupon"
SET "freshUntil" = CURRENT_TIMESTAMP + INTERVAL '20 days'
WHERE "source" IN ('SCRAPE', 'API')
  AND ("freshUntil" IS NULL OR "freshUntil" < CURRENT_TIMESTAMP + INTERVAL '20 days');
