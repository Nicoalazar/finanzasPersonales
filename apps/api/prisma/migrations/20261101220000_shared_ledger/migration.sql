-- CreateEnum
CREATE TYPE "SharedPayer" AS ENUM ('ME', 'PARTNER');

-- CreateEnum
CREATE TYPE "SharedSource" AS ENUM ('FORM', 'MANUAL');

-- AlterTable
ALTER TABLE "CardPurchase" ADD COLUMN     "sharedExpenseId" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "sharedExpenseId" TEXT,
ADD COLUMN     "sharedMonth" TEXT;

-- CreateTable
CREATE TABLE "SharedLedger" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "groupId" TEXT,
    "meName" TEXT NOT NULL DEFAULT 'Yo',
    "partnerName" TEXT NOT NULL DEFAULT 'Pareja',
    "sourceUrl" TEXT,
    "fromMonth" TEXT NOT NULL,
    "defaultAccountId" TEXT,
    "lastSyncAt" TIMESTAMP(3),

    CONSTRAINT "SharedLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedKind" (
    "kind" TEXT NOT NULL,
    "categoryId" TEXT,

    CONSTRAINT "SharedKind_pkey" PRIMARY KEY ("kind")
);

-- CreateTable
CREATE TABLE "SharedExpense" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "month" TEXT NOT NULL,
    "payer" "SharedPayer" NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(14,2) NOT NULL,
    "source" "SharedSource" NOT NULL DEFAULT 'MANUAL',
    "externalKey" TEXT,
    "ignored" BOOLEAN NOT NULL DEFAULT false,
    "accountId" TEXT,
    "cardId" TEXT,
    "installmentCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SharedExpense_externalKey_key" ON "SharedExpense"("externalKey");

-- CreateIndex
CREATE INDEX "SharedExpense_month_idx" ON "SharedExpense"("month");

-- CreateIndex
CREATE UNIQUE INDEX "CardPurchase_sharedExpenseId_key" ON "CardPurchase"("sharedExpenseId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_sharedExpenseId_key" ON "Transaction"("sharedExpenseId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_sharedExpenseId_fkey" FOREIGN KEY ("sharedExpenseId") REFERENCES "SharedExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardPurchase" ADD CONSTRAINT "CardPurchase_sharedExpenseId_fkey" FOREIGN KEY ("sharedExpenseId") REFERENCES "SharedExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedLedger" ADD CONSTRAINT "SharedLedger_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SharedGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedKind" ADD CONSTRAINT "SharedKind_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

