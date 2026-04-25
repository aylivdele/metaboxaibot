-- CreateTable
CREATE TABLE "user_uploads" (
    "id" TEXT NOT NULL,
    "userId" BIGINT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "s3Key" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_uploads_userId_idx" ON "user_uploads"("userId");

-- AddForeignKey
ALTER TABLE "user_uploads" ADD CONSTRAINT "user_uploads_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
