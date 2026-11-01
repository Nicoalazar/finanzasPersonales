-- AlterTable
ALTER TABLE "RecurringExpense" ADD COLUMN     "dayOfMonth" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "amountLocked" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SharedGroupPercent" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "percent" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "SharedGroupPercent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringSkip" (
    "id" TEXT NOT NULL,
    "recurringId" TEXT NOT NULL,
    "period" TEXT NOT NULL,

    CONSTRAINT "RecurringSkip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SharedGroupPercent_groupId_month_key" ON "SharedGroupPercent"("groupId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringSkip_recurringId_period_key" ON "RecurringSkip"("recurringId", "period");

-- AddForeignKey
ALTER TABLE "SharedGroupPercent" ADD CONSTRAINT "SharedGroupPercent_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SharedGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringSkip" ADD CONSTRAINT "RecurringSkip_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "RecurringExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

