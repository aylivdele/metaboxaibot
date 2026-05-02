-- Низкий IQ мод: подтверждение перед запуском генерации.
-- Default true — для всех пользователей включается явное подтверждение.
ALTER TABLE "users" ADD COLUMN "confirmBeforeGenerate" BOOLEAN NOT NULL DEFAULT true;

-- Один pending-запрос на пользователя. На новом промте upsert по userId.
CREATE TABLE "pending_generations" (
    "id" TEXT NOT NULL,
    "userId" BIGINT NOT NULL,
    "section" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "estimatedCost" DECIMAL(12,4) NOT NULL,
    "chatId" BIGINT NOT NULL,
    "messageId" BIGINT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_generations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pending_generations_userId_key" ON "pending_generations"("userId");
CREATE INDEX "pending_generations_expiresAt_idx" ON "pending_generations"("expiresAt");

ALTER TABLE "pending_generations" ADD CONSTRAINT "pending_generations_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
