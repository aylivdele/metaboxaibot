-- Initial schema — captures the baseline state before incremental migrations.
-- Tables are created in their pre-migration form so that subsequent ALTER TABLE
-- migrations apply cleanly on a fresh database.

CREATE TYPE "Role" AS ENUM ('USER', 'MODERATOR', 'ADMIN');

-- ── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE "users" (
    "id"           BIGINT          NOT NULL,
    "username"     TEXT,
    "firstName"    TEXT,
    "lastName"     TEXT,
    "language"     TEXT            NOT NULL DEFAULT 'en',
    "role"         "Role"          NOT NULL DEFAULT 'USER',
    "tokenBalance" DECIMAL(12,4)   NOT NULL DEFAULT 5.50,
    "isNew"        BOOLEAN         NOT NULL DEFAULT true,
    "isBlocked"    BOOLEAN         NOT NULL DEFAULT false,
    "referredById" BIGINT,
    "createdAt"    TIMESTAMPTZ(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMPTZ(3)  NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "users"
    ADD CONSTRAINT "users_referredById_fkey"
    FOREIGN KEY ("referredById") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── User states ───────────────────────────────────────────────────────────────
CREATE TABLE "user_states" (
    "userId"          BIGINT  NOT NULL,
    "state"           TEXT    NOT NULL DEFAULT 'IDLE',
    "section"         TEXT,
    "modelId"         TEXT,
    "gptDialogId"     TEXT,
    "designDialogId"  TEXT,
    "audioDialogId"   TEXT,
    "videoDialogId"   TEXT,
    "updatedAt"       TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_states_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "user_states"
    ADD CONSTRAINT "user_states_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Dialogs ───────────────────────────────────────────────────────────────────
CREATE TABLE "dialogs" (
    "id"                     TEXT           NOT NULL,
    "userId"                 BIGINT         NOT NULL,
    "section"                TEXT           NOT NULL,
    "modelId"                TEXT           NOT NULL,
    "title"                  TEXT,
    "isDeleted"              BOOLEAN        NOT NULL DEFAULT false,
    "contextStrategy"        TEXT           NOT NULL DEFAULT 'db_history',
    "providerThreadId"       TEXT,
    "providerLastResponseId" TEXT,
    "createdAt"              TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"              TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "dialogs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "dialogs"
    ADD CONSTRAINT "dialogs_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "dialogs_userId_idx"         ON "dialogs"("userId");
CREATE INDEX "dialogs_userId_section_idx" ON "dialogs"("userId", "section");

-- ── Messages ──────────────────────────────────────────────────────────────────
CREATE TABLE "messages" (
    "id"                TEXT           NOT NULL,
    "dialogId"          TEXT           NOT NULL,
    "role"              TEXT           NOT NULL,
    "content"           TEXT           NOT NULL,
    "mediaUrl"          TEXT,
    "mediaType"         TEXT,
    "tokensUsed"        DECIMAL(10,4)  NOT NULL DEFAULT 0,
    "providerMessageId" TEXT,
    "createdAt"         TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "messages"
    ADD CONSTRAINT "messages_dialogId_fkey"
    FOREIGN KEY ("dialogId") REFERENCES "dialogs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "messages_dialogId_createdAt_idx" ON "messages"("dialogId", "createdAt");

-- ── Token transactions ────────────────────────────────────────────────────────
CREATE TABLE "token_transactions" (
    "id"        TEXT           NOT NULL,
    "userId"    BIGINT         NOT NULL,
    "amount"    DECIMAL(12,4)  NOT NULL,
    "type"      TEXT           NOT NULL,
    "reason"    TEXT           NOT NULL,
    "modelId"   TEXT,
    "dialogId"  TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_transactions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "token_transactions"
    ADD CONSTRAINT "token_transactions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "token_transactions_userId_idx" ON "token_transactions"("userId");

-- ── Generation jobs ───────────────────────────────────────────────────────────
CREATE TABLE "generation_jobs" (
    "id"          TEXT           NOT NULL,
    "userId"      BIGINT         NOT NULL,
    "dialogId"    TEXT           NOT NULL,
    "section"     TEXT           NOT NULL,
    "modelId"     TEXT           NOT NULL,
    "status"      TEXT           NOT NULL DEFAULT 'pending',
    "prompt"      TEXT           NOT NULL,
    "inputData"   JSONB,
    "outputUrl"   TEXT,
    "error"       TEXT,
    "createdAt"   TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "generation_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "generation_jobs_userId_idx" ON "generation_jobs"("userId");
CREATE INDEX "generation_jobs_status_idx" ON "generation_jobs"("status");

-- ── Banner slides ─────────────────────────────────────────────────────────────
CREATE TABLE "banner_slides" (
    "id"             TEXT           NOT NULL,
    "imageUrl"       TEXT           NOT NULL,
    "linkUrl"        TEXT,
    "displaySeconds" INTEGER        NOT NULL DEFAULT 4,
    "sortOrder"      INTEGER        NOT NULL DEFAULT 0,
    "active"         BOOLEAN        NOT NULL DEFAULT true,
    "createdAt"      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "banner_slides_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "banner_slides_active_sortOrder_idx" ON "banner_slides"("active", "sortOrder");
