ALTER TABLE "SupplementaryContent"
ADD COLUMN "donorOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "donorAccessLevel" "BookDonorAccessLevel" NOT NULL DEFAULT 'PUBLIC';
