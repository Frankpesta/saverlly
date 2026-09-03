-- CreateTable
CREATE TABLE "DismissedAlert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "alertKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DismissedAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DismissedAlert_userId_idx" ON "DismissedAlert"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DismissedAlert_userId_alertKey_key" ON "DismissedAlert"("userId", "alertKey");

-- AddForeignKey
ALTER TABLE "DismissedAlert" ADD CONSTRAINT "DismissedAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
