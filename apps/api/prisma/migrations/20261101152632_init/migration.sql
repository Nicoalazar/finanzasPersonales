-- CreateEnum
CREATE TYPE "TxType" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER');

-- CreateEnum
CREATE TYPE "TxStatus" AS ENUM ('PENDING', 'PAID');

-- CreateEnum
CREATE TYPE "CategoryType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('CASH', 'BANK', 'WALLET', 'INVESTMENT');

-- CreateEnum
CREATE TYPE "ShareMode" AS ENUM ('PERCENT', 'AMOUNT');

-- CreateEnum
CREATE TYPE "Frequency" AS ENUM ('MONTHLY', 'BIMONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "PayslipKind" AS ENUM ('MONTHLY', 'SAC');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "AccountKind" NOT NULL DEFAULT 'BANK',
    "initialBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CategoryType" NOT NULL,
    "parentId" TEXT,
    "color" TEXT,
    "icon" TEXT,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "type" "TxType" NOT NULL,
    "status" "TxStatus" NOT NULL DEFAULT 'PAID',
    "description" TEXT NOT NULL DEFAULT '',
    "categoryId" TEXT,
    "accountId" TEXT NOT NULL,
    "toAccountId" TEXT,
    "recurringId" TEXT,
    "payslipId" TEXT,
    "statementId" TEXT,
    "period" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditCard" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "closingDay" INTEGER NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "stampTaxRate" DECIMAL(6,4) NOT NULL DEFAULT 0.007,
    "isThirdParty" BOOLEAN NOT NULL DEFAULT false,
    "payAccountId" TEXT,

    CONSTRAINT "CreditCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardPurchase" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "categoryId" TEXT,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "installmentCount" INTEGER NOT NULL DEFAULT 1,
    "firstStatementMonth" TEXT NOT NULL,

    CONSTRAINT "CardPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardInstallment" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "month" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "CardInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardStatement" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "adjustment" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "refunds" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "CardStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonShare" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "purchaseId" TEXT,
    "recurringId" TEXT,
    "mode" "ShareMode" NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "PersonShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonCharge" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "installmentCount" INTEGER NOT NULL DEFAULT 1,
    "firstMonth" TEXT NOT NULL,

    CONSTRAINT "PersonCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonPayment" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "PersonPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "myPercent" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "SharedGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringExpense" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT,
    "frequency" "Frequency" NOT NULL DEFAULT 'MONTHLY',
    "accountId" TEXT,
    "sharedGroupId" TEXT,
    "startMonth" TEXT NOT NULL,
    "endMonth" TEXT,

    CONSTRAINT "RecurringExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringPriceChange" (
    "id" TEXT NOT NULL,
    "recurringId" TEXT NOT NULL,
    "fromMonth" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "RecurringPriceChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BalanceSnapshot" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "BalanceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryConcept" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDeduction" BOOLEAN NOT NULL,
    "percent" DECIMAL(8,6),
    "fixedAmount" DECIMAL(14,2),
    "multiplier" DECIMAL(8,2) NOT NULL DEFAULT 1,
    "appliesToSac" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SalaryConcept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payslip" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "kind" "PayslipKind" NOT NULL DEFAULT 'MONTHLY',
    "basic" DECIMAL(14,2) NOT NULL,
    "overtimeHours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "bonus" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "concepts" JSONB NOT NULL,
    "gross" DECIMAL(14,2) NOT NULL,
    "deductions" DECIMAL(14,2) NOT NULL,
    "net" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_type_key" ON "Category"("name", "type");

-- CreateIndex
CREATE INDEX "Transaction_period_idx" ON "Transaction"("period");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_recurringId_period_key" ON "Transaction"("recurringId", "period");

-- CreateIndex
CREATE INDEX "CardInstallment_month_idx" ON "CardInstallment"("month");

-- CreateIndex
CREATE UNIQUE INDEX "CardStatement_cardId_month_key" ON "CardStatement"("cardId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "Person_name_key" ON "Person"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SharedGroup_name_key" ON "SharedGroup"("name");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringPriceChange_recurringId_fromMonth_key" ON "RecurringPriceChange"("recurringId", "fromMonth");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_categoryId_month_key" ON "Budget"("categoryId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_month_kind_key" ON "Payslip"("month", "kind");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "RecurringExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "Payslip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "CardStatement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_payAccountId_fkey" FOREIGN KEY ("payAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardPurchase" ADD CONSTRAINT "CardPurchase_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CreditCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardPurchase" ADD CONSTRAINT "CardPurchase_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardInstallment" ADD CONSTRAINT "CardInstallment_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "CardPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardStatement" ADD CONSTRAINT "CardStatement_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CreditCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonShare" ADD CONSTRAINT "PersonShare_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonShare" ADD CONSTRAINT "PersonShare_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "CardPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonShare" ADD CONSTRAINT "PersonShare_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "RecurringExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonCharge" ADD CONSTRAINT "PersonCharge_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonPayment" ADD CONSTRAINT "PersonPayment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_sharedGroupId_fkey" FOREIGN KEY ("sharedGroupId") REFERENCES "SharedGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringPriceChange" ADD CONSTRAINT "RecurringPriceChange_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "RecurringExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceSnapshot" ADD CONSTRAINT "BalanceSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
