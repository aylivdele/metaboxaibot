-- AlterTable
ALTER TABLE "user_voices" ADD COLUMN "providerKeyId" TEXT;
ALTER TABLE "user_avatars" ADD COLUMN "providerKeyId" TEXT;

-- AddForeignKey
ALTER TABLE "user_voices" ADD CONSTRAINT "user_voices_providerKeyId_fkey" FOREIGN KEY ("providerKeyId") REFERENCES "provider_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_avatars" ADD CONSTRAINT "user_avatars_providerKeyId_fkey" FOREIGN KEY ("providerKeyId") REFERENCES "provider_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "user_voices_providerKeyId_idx" ON "user_voices"("providerKeyId");
CREATE INDEX "user_avatars_providerKeyId_idx" ON "user_avatars"("providerKeyId");
