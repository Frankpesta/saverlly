-- Which coupon sites have seen each code (CouponSighting), for ranking codes several sites
-- agree on ahead of single-site ones. Starts empty: sightings build up as sources run.

-- CreateTable
CREATE TABLE "CouponSighting" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "strategy" "ScrapeStrategy" NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponSighting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CouponSighting_couponId_strategy_key" ON "CouponSighting"("couponId", "strategy");

-- AddForeignKey
ALTER TABLE "CouponSighting" ADD CONSTRAINT "CouponSighting_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

