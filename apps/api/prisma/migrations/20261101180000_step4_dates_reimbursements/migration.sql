-- AlterTable
ALTER TABLE "CardStatement" ADD COLUMN     "closingDate" DATE,
ADD COLUMN     "dueDate" DATE;

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "isReimbursement" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "personPaymentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_personPaymentId_key" ON "Transaction"("personPaymentId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_personPaymentId_fkey" FOREIGN KEY ("personPaymentId") REFERENCES "PersonPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

