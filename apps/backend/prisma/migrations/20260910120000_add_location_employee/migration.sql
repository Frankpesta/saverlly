-- CreateTable
CREATE TABLE "LocationEmployee" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationEmployee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LocationEmployee_locationId_idx" ON "LocationEmployee"("locationId");

-- AddForeignKey
ALTER TABLE "LocationEmployee" ADD CONSTRAINT "LocationEmployee_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
