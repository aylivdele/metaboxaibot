CREATE TABLE "user_voices" (
  "id" TEXT NOT NULL,
  "userId" BIGINT NOT NULL,
  "provider" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "externalId" TEXT,
  "previewUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ready',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_voices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_voices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "user_voices_userId_idx" ON "user_voices"("userId");
CREATE INDEX "user_voices_userId_provider_idx" ON "user_voices"("userId", "provider");
