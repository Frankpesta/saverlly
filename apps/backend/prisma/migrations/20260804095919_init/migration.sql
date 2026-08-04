-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'KIOSK_OWNER', 'LOCATION_MANAGER');

-- CreateEnum
CREATE TYPE "KioskStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "kioskId" TEXT,
    "managedLocationIds" TEXT[],
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kiosk" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "KioskStatus" NOT NULL DEFAULT 'ACTIVE',
    "revenueSharePct" DECIMAL(5,2) NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "stripeAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kiosk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "kioskId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationSetupCode" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationSetupCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_kioskId_idx" ON "User"("kioskId");

-- CreateIndex
CREATE INDEX "Location_kioskId_idx" ON "Location"("kioskId");

-- CreateIndex
CREATE UNIQUE INDEX "LocationSetupCode_code_key" ON "LocationSetupCode"("code");

-- CreateIndex
CREATE INDEX "LocationSetupCode_locationId_idx" ON "LocationSetupCode"("locationId");

-- CreateIndex
CREATE INDEX "Device_locationId_idx" ON "Device"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_tokenHash_key" ON "DeviceToken"("tokenHash");

-- CreateIndex
CREATE INDEX "DeviceToken_deviceId_idx" ON "DeviceToken"("deviceId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_kioskId_fkey" FOREIGN KEY ("kioskId") REFERENCES "Kiosk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_kioskId_fkey" FOREIGN KEY ("kioskId") REFERENCES "Kiosk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationSetupCode" ADD CONSTRAINT "LocationSetupCode_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
