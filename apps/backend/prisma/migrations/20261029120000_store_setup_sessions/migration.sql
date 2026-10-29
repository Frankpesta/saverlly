-- CreateEnum
CREATE TYPE "StoreSetupStatus" AS ENUM ('PENDING', 'CONNECTED', 'SUBMITTED', 'APPLIED', 'CANCELLED');

-- CreateTable
CREATE TABLE "StoreSetupSession" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "createdById" TEXT,
    "status" "StoreSetupStatus" NOT NULL DEFAULT 'PENDING',
    "codeHash" TEXT NOT NULL,
    "codeExpiresAt" TIMESTAMP(3) NOT NULL,
    "tokenHash" TEXT,
    "sessionExpiresAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "draftRecipe" JSONB,
    "testResult" JSONB,
    "submittedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "appliedById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreSetupSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreSetupSession_codeHash_key" ON "StoreSetupSession"("codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "StoreSetupSession_tokenHash_key" ON "StoreSetupSession"("tokenHash");

-- CreateIndex
CREATE INDEX "StoreSetupSession_merchantId_status_idx" ON "StoreSetupSession"("merchantId", "status");

-- AddForeignKey
ALTER TABLE "StoreSetupSession" ADD CONSTRAINT "StoreSetupSession_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreSetupSession" ADD CONSTRAINT "StoreSetupSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreSetupSession" ADD CONSTRAINT "StoreSetupSession_appliedById_fkey" FOREIGN KEY ("appliedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

