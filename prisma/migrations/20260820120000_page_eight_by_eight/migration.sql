-- AlterTable
ALTER TABLE "Page" ADD COLUMN "eightByEightScore" INTEGER;
ALTER TABLE "Page" ADD COLUMN "eightByEightBreakdown" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Page" ADD COLUMN "eightByEightScoredAt" DATETIME;
ALTER TABLE "Page" ADD COLUMN "eightByEightVersion" TEXT NOT NULL DEFAULT '';
