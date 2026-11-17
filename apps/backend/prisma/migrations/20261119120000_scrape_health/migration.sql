-- Run history for the coupon sites panel and "site down" alerts (kept 30 days), per-site pause
-- state, blocks counted apart from failures for back-off, and the COUPON_SITE_DOWN notification.

-- CreateEnum
CREATE TYPE "ScrapeRunOutcome" AS ENUM ('SUCCEEDED', 'BLOCKED', 'NOT_LISTED', 'FAILED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'COUPON_SITE_DOWN';

-- AlterTable
ALTER TABLE "ScrapeSource" ADD COLUMN     "consecutiveBlocks" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ScrapeRun" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "strategy" "ScrapeStrategy" NOT NULL,
    "outcome" "ScrapeRunOutcome" NOT NULL,
    "codeCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "finishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScrapeRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponSiteState" (
    "strategy" "ScrapeStrategy" NOT NULL,
    "pausedUntil" TIMESTAMP(3),
    "downNotifiedAt" TIMESTAMP(3),

    CONSTRAINT "CouponSiteState_pkey" PRIMARY KEY ("strategy")
);

-- CreateIndex
CREATE INDEX "ScrapeRun_strategy_finishedAt_idx" ON "ScrapeRun"("strategy", "finishedAt");

-- CreateIndex
CREATE INDEX "ScrapeRun_sourceId_finishedAt_idx" ON "ScrapeRun"("sourceId", "finishedAt");

-- AddForeignKey
ALTER TABLE "ScrapeRun" ADD CONSTRAINT "ScrapeRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ScrapeSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Until now a block counted as a failure. A source blocked on its last run carries that count
-- over as blocks, so back-off starts from it and the "failing" flag isn't set by blocks.
UPDATE "ScrapeSource"
SET "consecutiveBlocks" = GREATEST("consecutiveFailures", 1), "consecutiveFailures" = 0
WHERE "status" = 'BLOCKED';
