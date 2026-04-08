-- Drop deprecated subscription fields from users table.
-- Subscription state now lives exclusively in local_subscriptions table.
ALTER TABLE "users" DROP COLUMN IF EXISTS "subscriptionEndDate";
ALTER TABLE "users" DROP COLUMN IF EXISTS "subscriptionPlanName";
