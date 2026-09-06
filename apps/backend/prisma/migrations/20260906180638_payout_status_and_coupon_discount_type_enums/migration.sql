-- CreateEnum
CREATE TYPE "CouponDiscountType" AS ENUM ('PERCENT', 'FIXED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED');

-- AlterTable: Coupon.discountType was a free-text "percent"|"fixed"|"unknown" string. Cast
-- existing values into the new enum instead of dropping the column, since UPPER() maps every
-- existing value ("percent" -> PERCENT) and NULL passes through the cast unchanged.
ALTER TABLE "Coupon" ALTER COLUMN "discountType" TYPE "CouponDiscountType" USING (UPPER("discountType")::"CouponDiscountType");

-- AlterTable: Payout.status was a free-text "pending"|"processing"|"paid"|"failed" string
-- with a matching default. Same UPPER()-cast approach, plus re-set the default in the new
-- enum's casing since dropping/re-adding the column would discard existing rows' status.
ALTER TABLE "Payout" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Payout" ALTER COLUMN "status" TYPE "PayoutStatus" USING (UPPER("status")::"PayoutStatus");
ALTER TABLE "Payout" ALTER COLUMN "status" SET DEFAULT 'PENDING';
