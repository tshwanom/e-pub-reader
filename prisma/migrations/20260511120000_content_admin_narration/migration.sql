-- Standalone platform content and narration for articles/videos/poems/quotes.

CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

ALTER TABLE "SupplementaryContent"
  ADD COLUMN "status" "ContentStatus" NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "summary" TEXT,
  ADD COLUMN "coverUrl" TEXT,
  ADD COLUMN "narrationEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "publishedAt" TIMESTAMP(3);

UPDATE "SupplementaryContent"
SET "publishedAt" = "createdAt"
WHERE "publishedAt" IS NULL;

ALTER TABLE "SupplementaryContent" DROP CONSTRAINT IF EXISTS "SupplementaryContent_bookId_fkey";
ALTER TABLE "SupplementaryContent" ALTER COLUMN "bookId" DROP NOT NULL;
ALTER TABLE "SupplementaryContent"
  ADD CONSTRAINT "SupplementaryContent_bookId_fkey"
  FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "SupplementaryContent_slug_key" ON "SupplementaryContent"("slug");

CREATE TABLE "ContentNarration" (
  "id" TEXT NOT NULL,
  "contentId" TEXT NOT NULL,
  "voiceId" TEXT NOT NULL,
  "status" "NarrationJobStatus" NOT NULL DEFAULT 'PENDING',
  "storageProvider" "NarrationStorageProvider" NOT NULL DEFAULT 'S3',
  "audioObjectKey" TEXT,
  "audioMimeType" TEXT NOT NULL DEFAULT 'audio/wav',
  "durationMs" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "readyAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ContentNarration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContentNarration_contentId_voiceId_key" ON "ContentNarration"("contentId", "voiceId");
CREATE INDEX "ContentNarration_contentId_active_status_idx" ON "ContentNarration"("contentId", "active", "status");

ALTER TABLE "ContentNarration"
  ADD CONSTRAINT "ContentNarration_contentId_fkey"
  FOREIGN KEY ("contentId") REFERENCES "SupplementaryContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContentNarration"
  ADD CONSTRAINT "ContentNarration_voiceId_fkey"
  FOREIGN KEY ("voiceId") REFERENCES "NarrationVoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
