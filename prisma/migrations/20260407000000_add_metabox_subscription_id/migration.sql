-- AlterTable: add metaboxSubscriptionId to local_subscriptions for cross-system idempotency
ALTER TABLE "local_subscriptions" ADD COLUMN "metaboxSubscriptionId" TEXT;

-- CreateIndex: unique constraint so we can lookup by metaboxSubscriptionId
CREATE UNIQUE INDEX "local_subscriptions_metaboxSubscriptionId_key" ON "local_subscriptions"("metaboxSubscriptionId");
