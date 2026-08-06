/*
  Warnings:

  - You are about to alter the column `discountAmount` on the `CouponTestEvent` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.

*/
-- AlterTable
ALTER TABLE "CouponTestEvent" ALTER COLUMN "discountAmount" SET DATA TYPE DECIMAL(10,2);
