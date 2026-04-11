-- Add attachments JSON column to messages table.
-- Stores an array of { s3Key, mimeType, name, size } for documents attached to a chat message.
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "attachments" JSONB;
