-- CreateTable
CREATE TABLE "SpendingEstimate" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "SpendingEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectionSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "inflationPct" DECIMAL(5,2) NOT NULL DEFAULT 0,

    CONSTRAINT "ProjectionSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpendingEstimate_categoryId_key" ON "SpendingEstimate"("categoryId");

-- AddForeignKey
ALTER TABLE "SpendingEstimate" ADD CONSTRAINT "SpendingEstimate_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
