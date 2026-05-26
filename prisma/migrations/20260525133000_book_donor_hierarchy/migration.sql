-- CreateEnum
CREATE TYPE "BookDonorAccessLevel" AS ENUM ('PUBLIC', 'ALL_DONORS', 'RECURRING_DONORS');

-- AlterTable
ALTER TABLE "Book"
ADD COLUMN "donorAccessLevel" "BookDonorAccessLevel" NOT NULL DEFAULT 'PUBLIC';

-- Data backfill
UPDATE "Book"
SET "donorAccessLevel" = 'ALL_DONORS'
WHERE "donorOnly" = true;
