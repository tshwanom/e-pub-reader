-- Repair helper to safely create missing enums and tables prior to migration 20260511120000_content_admin_narration.
-- Safe to run multiple times.

-- 1) Create ContentType enum if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    INNER JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'ContentType' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "ContentType" AS ENUM ('VIDEO', 'ARTICLE', 'POEM', 'QUOTE');
  END IF;
END $$;

-- 2) Create NarrationJobStatus enum if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    INNER JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'NarrationJobStatus' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "NarrationJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'ARCHIVED');
  END IF;
END $$;

-- 3) Create NarrationStorageProvider enum if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    INNER JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'NarrationStorageProvider' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "NarrationStorageProvider" AS ENUM ('S3', 'R2', 'B2', 'LOCAL');
  END IF;
END $$;

-- 4) Create NarrationVoice table if not exists
CREATE TABLE IF NOT EXISTS "NarrationVoice" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "language" TEXT NOT NULL DEFAULT 'en',
  "description" TEXT,
  "sampleText" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NarrationVoice_pkey" PRIMARY KEY ("id")
);

-- Create slug index if not exists
CREATE UNIQUE INDEX IF NOT EXISTS "NarrationVoice_slug_key" ON "NarrationVoice"("slug");

-- 5) Create SupplementaryContent table if not exists
CREATE TABLE IF NOT EXISTS "SupplementaryContent" (
  "id" TEXT NOT NULL,
  "bookId" TEXT,
  "type" "ContentType" NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT,
  "url" TEXT,
  "author" TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplementaryContent_pkey" PRIMARY KEY ("id")
);
