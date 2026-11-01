-- AlterTable
ALTER TABLE "Payslip" DROP COLUMN "basic",
DROP COLUMN "bonus",
DROP COLUMN "concepts",
DROP COLUMN "deductions",
DROP COLUMN "overtimeHours";

-- DropTable
DROP TABLE "SalaryConcept";

