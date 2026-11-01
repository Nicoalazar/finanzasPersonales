-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "informal" BOOLEAN NOT NULL DEFAULT false,
    "accountId" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Job_name_key" ON "Job"("name");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Los recibos ya cargados pasan a un trabajo inicial (renombrable)
INSERT INTO "Job" ("id", "name") SELECT 'job_principal', 'Trabajo principal' WHERE EXISTS (SELECT 1 FROM "Payslip");

-- AlterTable
ALTER TABLE "Payslip" ADD COLUMN "jobId" TEXT;
UPDATE "Payslip" SET "jobId" = 'job_principal';
ALTER TABLE "Payslip" ALTER COLUMN "jobId" SET NOT NULL,
ALTER COLUMN "gross" DROP NOT NULL;

-- DropIndex
DROP INDEX "Payslip_month_kind_key";

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_jobId_month_kind_key" ON "Payslip"("jobId", "month", "kind");

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
