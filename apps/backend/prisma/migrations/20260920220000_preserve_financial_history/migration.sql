ALTER TABLE "Device" ADD COLUMN "retiredAt" TIMESTAMP(3);
DROP INDEX "CommissionEvent_subId_key";
CREATE INDEX "CommissionEvent_subId_idx" ON "CommissionEvent"("subId");
ALTER TABLE "CommissionEvent" ADD COLUMN "lastReconciledAt" TIMESTAMP(3);
ALTER TABLE "CommissionEvent" ADD COLUMN "isTest" BOOLEAN NOT NULL DEFAULT false;
UPDATE "CommissionEvent" SET "isTest" = true WHERE "networkReference" LIKE 'MOCKCONV-%';
CREATE INDEX "CommissionEvent_status_lastReconciledAt_idx" ON "CommissionEvent"("status", "lastReconciledAt");
ALTER TABLE "Payout" ADD COLUMN "transferStartedAt" TIMESTAMP(3), ADD COLUMN "transferDestination" TEXT;
CREATE TABLE "CommissionAdjustment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "commissionEventId" TEXT NOT NULL,
  "kioskId" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "payoutId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommissionAdjustment_commissionEventId_fkey" FOREIGN KEY ("commissionEventId") REFERENCES "CommissionEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CommissionAdjustment_kioskId_fkey" FOREIGN KEY ("kioskId") REFERENCES "Kiosk"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CommissionAdjustment_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CommissionAdjustment_commissionEventId_key" ON "CommissionAdjustment"("commissionEventId");
CREATE INDEX "CommissionAdjustment_kioskId_payoutId_idx" ON "CommissionAdjustment"("kioskId", "payoutId");
