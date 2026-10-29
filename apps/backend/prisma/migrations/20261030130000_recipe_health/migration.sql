-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'STORE_NEEDS_RECHECK';

-- CreateEnum
CREATE TYPE "RecipeProblem" AS ENUM ('PROMO_BOX_CHANGED', 'ORDER_TOTAL_CHANGED');

-- AlterTable
ALTER TABLE "Merchant" ADD COLUMN     "recipeNeedsRecheckAt" TIMESTAMP(3),
ADD COLUMN     "recipeProblem" "RecipeProblem",
ADD COLUMN     "recipeSavedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RecipeHealthReport" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "problem" "RecipeProblem",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipeHealthReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecipeHealthReport_merchantId_createdAt_idx" ON "RecipeHealthReport"("merchantId", "createdAt");

-- AddForeignKey
ALTER TABLE "RecipeHealthReport" ADD CONSTRAINT "RecipeHealthReport_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
