-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REVERSED');

-- AlterTable
ALTER TABLE "Merchant" ADD COLUMN     "affiliateSubIdParamKey" TEXT;

-- CreateTable
CREATE TABLE "AttributionAttempt" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "subId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttributionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionEvent" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "couponId" TEXT,
    "networkReference" TEXT NOT NULL,
    "orderValue" DECIMAL(10,2) NOT NULL,
    "commissionAmount" DECIMAL(10,2) NOT NULL,
    "kioskShareAmount" DECIMAL(10,2) NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "reportedAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payoutId" TEXT,

    CONSTRAINT "CommissionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "kioskId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "stripeTransferId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AttributionAttempt_subId_key" ON "AttributionAttempt"("subId");

-- CreateIndex
CREATE INDEX "AttributionAttempt_deviceId_idx" ON "AttributionAttempt"("deviceId");

-- CreateIndex
CREATE INDEX "AttributionAttempt_merchantId_idx" ON "AttributionAttempt"("merchantId");

-- CreateIndex
CREATE INDEX "CommissionEvent_deviceId_idx" ON "CommissionEvent"("deviceId");

-- CreateIndex
CREATE INDEX "CommissionEvent_merchantId_idx" ON "CommissionEvent"("merchantId");

-- CreateIndex
CREATE INDEX "CommissionEvent_status_idx" ON "CommissionEvent"("status");

-- CreateIndex
CREATE INDEX "CommissionEvent_payoutId_idx" ON "CommissionEvent"("payoutId");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionEvent_merchantId_networkReference_key" ON "CommissionEvent"("merchantId", "networkReference");

-- CreateIndex
CREATE INDEX "Payout_kioskId_idx" ON "Payout"("kioskId");

-- AddForeignKey
ALTER TABLE "AttributionAttempt" ADD CONSTRAINT "AttributionAttempt_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributionAttempt" ADD CONSTRAINT "AttributionAttempt_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionEvent" ADD CONSTRAINT "CommissionEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionEvent" ADD CONSTRAINT "CommissionEvent_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionEvent" ADD CONSTRAINT "CommissionEvent_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionEvent" ADD CONSTRAINT "CommissionEvent_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_kioskId_fkey" FOREIGN KEY ("kioskId") REFERENCES "Kiosk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
