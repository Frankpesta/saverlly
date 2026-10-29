-- CreateEnum
CREATE TYPE "StorePlatform" AS ENUM ('SHOPIFY', 'WOOCOMMERCE', 'BIGCOMMERCE', 'MAGENTO', 'WIX', 'SQUARESPACE');

-- AlterTable
ALTER TABLE "Merchant" ADD COLUMN     "platform" "StorePlatform",
ADD COLUMN     "platformCheckedAt" TIMESTAMP(3);
