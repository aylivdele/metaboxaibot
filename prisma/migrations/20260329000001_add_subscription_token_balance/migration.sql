ALTER TABLE "users"
  ADD COLUMN "subscriptionTokenBalance" DECIMAL(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN "subscriptionEndDate" TIMESTAMP(3),
  ADD COLUMN "subscriptionPlanName" TEXT,
  ALTER COLUMN "tokenBalance" SET DEFAULT 0;
