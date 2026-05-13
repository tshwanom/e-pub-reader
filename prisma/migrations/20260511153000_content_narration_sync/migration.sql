-- AlterTable
ALTER TABLE "SupplementaryContent"
ADD COLUMN "narrationSourceHash" TEXT;

-- AlterTable
ALTER TABLE "ContentNarration"
ADD COLUMN "sourceHash" TEXT,
ADD COLUMN "stylePrompt" TEXT;
