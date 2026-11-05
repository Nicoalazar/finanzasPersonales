-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('ARS', 'USD');

-- AlterTable
ALTER TABLE "CardPurchase" ADD COLUMN     "currency" "Currency" NOT NULL DEFAULT 'ARS',
ADD COLUMN     "usdRateEstimate" DECIMAL(14,4);

-- AlterTable
ALTER TABLE "CardStatement" ADD COLUMN     "usdRate" DECIMAL(14,4);
