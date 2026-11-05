-- AlterTable
ALTER TABLE "SharedGroup" ADD COLUMN     "personId" TEXT;

-- AddForeignKey
ALTER TABLE "SharedGroup" ADD CONSTRAINT "SharedGroup_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
