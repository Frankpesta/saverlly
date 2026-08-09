-- CreateEnum
CREATE TYPE "AnnouncementRepeatPolicy" AS ENUM ('ONCE', 'EVERY_LOGIN', 'MAX_N_TIMES');

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "kioskId" TEXT NOT NULL,
    "locationIds" TEXT[],
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "repeatPolicy" "AnnouncementRepeatPolicy" NOT NULL DEFAULT 'ONCE',
    "maxDisplayCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Announcement_kioskId_idx" ON "Announcement"("kioskId");

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_kioskId_fkey" FOREIGN KEY ("kioskId") REFERENCES "Kiosk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
