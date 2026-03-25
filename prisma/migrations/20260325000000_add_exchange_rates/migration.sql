-- CreateTable
CREATE TABLE "exchange_rates" (
    "pair" TEXT NOT NULL,
    "rate" DECIMAL(12,4) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("pair")
);

-- Seed default rate
INSERT INTO "exchange_rates" ("pair", "rate", "updatedAt")
VALUES ('USDT_RUB', 92.0000, NOW());
