-- AlterTable
ALTER TABLE "CommissionEvent" ADD COLUMN     "subId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CommissionEvent_subId_key" ON "CommissionEvent"("subId");

-- AddForeignKey
ALTER TABLE "CommissionEvent" ADD CONSTRAINT "CommissionEvent_subId_fkey" FOREIGN KEY ("subId") REFERENCES "AttributionAttempt"("subId") ON DELETE SET NULL ON UPDATE CASCADE;

