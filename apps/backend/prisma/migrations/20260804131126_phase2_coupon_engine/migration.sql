-- CreateEnum
CREATE TYPE "CouponSource" AS ENUM ('API', 'SCRAPE', 'MANUAL');

-- CreateEnum
CREATE TYPE "AttributionMethod" AS ENUM ('COOKIE', 'URL_PARAM', 'BOTH');

-- CreateTable
CREATE TABLE "AffiliateProgram" (
    "id" TEXT NOT NULL,
    "networkName" TEXT NOT NULL,
    "programId" TEXT,
    "apiCredentials" TEXT,
    "hasCouponApi" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "affiliateProgramId" TEXT,
    "attributionMethod" "AttributionMethod" NOT NULL,
    "affiliateTrackingUrl" TEXT,
    "affiliateUrlParamKey" TEXT,
    "affiliateUrlParamValue" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "checkoutRecipe" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "source" "CouponSource" NOT NULL,
    "discountType" TEXT,
    "discountValue" DOUBLE PRECISION,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "lastTestedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapeSource" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "merchantId" TEXT,
    "selectorConfig" JSONB NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ScrapeSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponTestEvent" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "couponId" TEXT,
    "merchantId" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponTestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_domain_key" ON "Merchant"("domain");

-- CreateIndex
CREATE INDEX "Merchant_affiliateProgramId_idx" ON "Merchant"("affiliateProgramId");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_merchantId_code_key" ON "Coupon"("merchantId", "code");

-- CreateIndex
CREATE INDEX "ScrapeSource_merchantId_idx" ON "ScrapeSource"("merchantId");

-- CreateIndex
CREATE INDEX "CouponTestEvent_deviceId_idx" ON "CouponTestEvent"("deviceId");

-- CreateIndex
CREATE INDEX "CouponTestEvent_merchantId_idx" ON "CouponTestEvent"("merchantId");

-- AddForeignKey
ALTER TABLE "Merchant" ADD CONSTRAINT "Merchant_affiliateProgramId_fkey" FOREIGN KEY ("affiliateProgramId") REFERENCES "AffiliateProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapeSource" ADD CONSTRAINT "ScrapeSource_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponTestEvent" ADD CONSTRAINT "CouponTestEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponTestEvent" ADD CONSTRAINT "CouponTestEvent_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponTestEvent" ADD CONSTRAINT "CouponTestEvent_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
