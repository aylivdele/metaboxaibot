-- Reset mediaInputs: shape changed from { [slotKey]: string[] } to
-- { [modelId]: { [slotKey]: string[] } }. Old data is ephemeral one-shot state;
-- safe to drop so leftover legacy rows are ignored cleanly.
-- The Soul photo buffer also lives in mediaInputs under the pseudo model-id
-- "soul_creation" / slot "photos" (file_ids without TTL, resolved to S3 at submit).
UPDATE "user_states" SET "mediaInputs" = NULL;
