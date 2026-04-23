-- AlterTable
ALTER TABLE "generation_jobs" ADD COLUMN "sourceMessageId" TEXT;

-- CreateIndex
CREATE INDEX "generation_jobs_userId_sourceMessageId_status_idx" ON "generation_jobs"("userId", "sourceMessageId", "status");
