-- CreateEnum
CREATE TYPE "DebtDirection" AS ENUM ('THEY_OWE', 'I_OWE');

-- CreateEnum
CREATE TYPE "PaymentDirection" AS ENUM ('IN', 'OUT');

-- AlterTable
ALTER TABLE "PersonCharge" ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "direction" "DebtDirection" NOT NULL DEFAULT 'THEY_OWE';

-- AlterTable
ALTER TABLE "PersonPayment" ADD COLUMN     "direction" "PaymentDirection" NOT NULL DEFAULT 'IN';

-- AddForeignKey
ALTER TABLE "PersonCharge" ADD CONSTRAINT "PersonCharge_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

