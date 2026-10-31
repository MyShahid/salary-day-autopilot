-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "nextSalaryDate" DATE,
ADD COLUMN     "unpaidLeaveDays" INTEGER NOT NULL DEFAULT 0;
