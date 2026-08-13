-- DropForeignKey
ALTER TABLE "Announcement" DROP CONSTRAINT "Announcement_kioskId_fkey";

-- AlterTable
ALTER TABLE "Announcement" ALTER COLUMN "kioskId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_kioskId_fkey" FOREIGN KEY ("kioskId") REFERENCES "Kiosk"("id") ON DELETE SET NULL ON UPDATE CASCADE;
