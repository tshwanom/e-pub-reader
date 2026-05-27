-- CreateTable
CREATE TABLE "ContentComment" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentComment_contentId_createdAt_idx" ON "ContentComment"("contentId", "createdAt");

-- CreateIndex
CREATE INDEX "ContentComment_userId_createdAt_idx" ON "ContentComment"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ContentComment" ADD CONSTRAINT "ContentComment_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "SupplementaryContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentComment" ADD CONSTRAINT "ContentComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;