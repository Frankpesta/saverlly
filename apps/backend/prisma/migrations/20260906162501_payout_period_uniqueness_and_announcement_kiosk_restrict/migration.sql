-- DropForeignKey
ALTER TABLE "Announcement" DROP CONSTRAINT "Announcement_kioskId_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "Payout_kioskId_periodStart_periodEnd_key" ON "Payout"("kioskId", "periodStart", "periodEnd");

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_kioskId_fkey" FOREIGN KEY ("kioskId") REFERENCES "Kiosk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
