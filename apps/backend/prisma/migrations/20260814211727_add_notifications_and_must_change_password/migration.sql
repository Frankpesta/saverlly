-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('KIOSK_OWNER_CREATED', 'LOCATION_MANAGER_CREATED', 'PAYOUT_PROCESSED', 'STRIPE_ONBOARDING_CHANGED', 'COMMISSION_DIGEST');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT true;

-- Backfill: existing users already know their own password and must not be
-- force-redirected to a change-password screen on their next login. Only
-- users created after this migration (via the server-generated-password
-- flows) should start with mustChangePassword = true.
UPDATE "User" SET "mustChangePassword" = false;

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "metadata" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
