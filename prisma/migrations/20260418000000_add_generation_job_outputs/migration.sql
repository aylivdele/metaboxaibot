-- CreateTable
CREATE TABLE "generation_job_outputs" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "index" INTEGER NOT NULL DEFAULT 0,
    "outputUrl" TEXT,
    "s3Key" TEXT,
    "thumbnailS3Key" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generation_job_outputs_pkey" PRIMARY KEY ("id")
);

-- Migrate existing data
INSERT INTO "generation_job_outputs" ("id", "jobId", "index", "outputUrl", "s3Key", "thumbnailS3Key", "createdAt")
SELECT
    gen_random_uuid()::text,
    "id",
    0,
    "outputUrl",
    "s3Key",
    "thumbnailS3Key",
    COALESCE("completedAt", "createdAt")
FROM "generation_jobs"
WHERE "outputUrl" IS NOT NULL OR "s3Key" IS NOT NULL;

-- CreateIndex
CREATE INDEX "generation_job_outputs_jobId_idx" ON "generation_job_outputs"("jobId");

-- AddForeignKey
ALTER TABLE "generation_job_outputs" ADD CONSTRAINT "generation_job_outputs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "generation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropColumns
ALTER TABLE "generation_jobs" DROP COLUMN "outputUrl";
ALTER TABLE "generation_jobs" DROP COLUMN "s3Key";
ALTER TABLE "generation_jobs" DROP COLUMN "thumbnailS3Key";
