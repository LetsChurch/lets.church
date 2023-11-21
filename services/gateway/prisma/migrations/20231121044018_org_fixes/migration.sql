/*
  Warnings:

  - You are about to drop the column `organizationId` on the `organization_address` table. All the data in the column will be lost.
  - You are about to drop the `address` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `organization_id` to the `organization_address` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `organization_address` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "organization_address" DROP CONSTRAINT "organization_address_organizationId_fkey";

-- AlterTable
ALTER TABLE "organization_address" DROP COLUMN "organizationId",
ADD COLUMN     "country" TEXT,
ADD COLUMN     "geocoding_json" JSONB,
ADD COLUMN     "locality" TEXT,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "organization_id" UUID NOT NULL,
ADD COLUMN     "post_office_box_number" TEXT,
ADD COLUMN     "postal_code" TEXT,
ADD COLUMN     "query" TEXT,
ADD COLUMN     "region" TEXT,
ADD COLUMN     "street_address" TEXT,
ADD COLUMN     "type" "address_type" NOT NULL;

-- DropTable
DROP TABLE "address";

-- RenameForeignKey
ALTER TABLE "organization_membership" RENAME CONSTRAINT "organization_membership_channel_id_fkey" TO "organization_membership_organization_id_fkey";

-- AddForeignKey
ALTER TABLE "organization_address" ADD CONSTRAINT "organization_address_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
