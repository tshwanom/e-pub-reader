-- Repair helper for a partially applied 20260525133000_book_donor_hierarchy migration.
-- Safe to run multiple times.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    INNER JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'BookDonorAccessLevel'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "BookDonorAccessLevel" AS ENUM ('PUBLIC', 'ALL_DONORS', 'RECURRING_DONORS');
  END IF;
END $$;

ALTER TABLE "Book"
ADD COLUMN IF NOT EXISTS "donorAccessLevel" "BookDonorAccessLevel";

ALTER TABLE "Book"
ALTER COLUMN "donorAccessLevel" SET DEFAULT 'PUBLIC'::"BookDonorAccessLevel";

UPDATE "Book"
SET "donorAccessLevel" = 'PUBLIC'::"BookDonorAccessLevel"
WHERE "donorAccessLevel" IS NULL;

UPDATE "Book"
SET "donorAccessLevel" = 'ALL_DONORS'::"BookDonorAccessLevel"
WHERE "donorOnly" = true
  AND "donorAccessLevel" IS DISTINCT FROM 'ALL_DONORS'::"BookDonorAccessLevel";

ALTER TABLE "Book"
ALTER COLUMN "donorAccessLevel" SET NOT NULL;
