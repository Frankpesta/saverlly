-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageSmallUrl" TEXT NOT NULL,
    "imageLargeUrl" TEXT NOT NULL,
    "clickUrl" TEXT NOT NULL,
    "targetTags" TEXT[],
    "locationIds" TEXT[],
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Promotion_active_startAt_endAt_idx" ON "Promotion"("active", "startAt", "endAt");
