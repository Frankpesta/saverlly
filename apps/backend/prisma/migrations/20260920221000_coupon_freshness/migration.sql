ALTER TABLE "Coupon" ADD COLUMN "lastSeenAt" TIMESTAMP(3), ADD COLUMN "freshUntil" TIMESTAMP(3);
-- Give existing automated codes a bounded refresh grace period rather than expiring the
-- entire catalog immediately at deployment. A successful subsequent observation renews it.
UPDATE "Coupon" SET "freshUntil" = CURRENT_TIMESTAMP + INTERVAL '7 days' WHERE "source" IN ('SCRAPE', 'API');
ALTER TABLE "ScrapeSource" ADD COLUMN "lastSucceededAt" TIMESTAMP(3), ADD COLUMN "lastError" TEXT, ADD COLUMN "lastCodeCount" INTEGER;
