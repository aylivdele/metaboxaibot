-- CreateTable
CREATE TABLE "local_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" BIGINT NOT NULL,
    "planName" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "tokensGranted" INTEGER NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "local_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "local_subscriptions_userId_key" ON "local_subscriptions"("userId");

-- AddForeignKey
ALTER TABLE "local_subscriptions" ADD CONSTRAINT "local_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
