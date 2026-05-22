-- CreateEnum
CREATE TYPE "DonationFrequency" AS ENUM ('ONE_TIME', 'MONTHLY');

-- AlterTable
ALTER TABLE "Donation"
ADD COLUMN "frequency" "DonationFrequency" NOT NULL DEFAULT 'ONE_TIME',
ADD COLUMN "paystackPlanCode" TEXT,
ADD COLUMN "paystackSubscriptionCode" TEXT,
ADD COLUMN "paystackCustomerCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Donation_paystackSubscriptionCode_key" ON "Donation"("paystackSubscriptionCode");
