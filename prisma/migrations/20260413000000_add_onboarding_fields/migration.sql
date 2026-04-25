-- AlterTable
ALTER TABLE "users" ADD COLUMN "finishedOnboarding" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "generationCount" INTEGER NOT NULL DEFAULT 0;
