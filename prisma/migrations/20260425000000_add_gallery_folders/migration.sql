-- CreateTable
CREATE TABLE "gallery_folders" (
    "id" TEXT NOT NULL,
    "userId" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "pinnedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gallery_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gallery_folder_items" (
    "folderId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gallery_folder_items_pkey" PRIMARY KEY ("folderId","jobId")
);

-- CreateIndex
CREATE INDEX "gallery_folders_userId_idx" ON "gallery_folders"("userId");

-- CreateIndex
CREATE INDEX "gallery_folder_items_jobId_idx" ON "gallery_folder_items"("jobId");

-- AddForeignKey
ALTER TABLE "gallery_folders" ADD CONSTRAINT "gallery_folders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gallery_folder_items" ADD CONSTRAINT "gallery_folder_items_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "gallery_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gallery_folder_items" ADD CONSTRAINT "gallery_folder_items_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "generation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
