-- Add s3Key column to generation_jobs for persistent file storage
ALTER TABLE "generation_jobs" ADD COLUMN "s3Key" TEXT;
