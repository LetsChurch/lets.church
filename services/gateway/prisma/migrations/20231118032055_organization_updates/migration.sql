-- CreateEnum
CREATE TYPE "organization_type" AS ENUM ('CHURCH', 'MINISTRY');

-- CreateEnum
CREATE TYPE "address_type" AS ENUM ('MAILING', 'MEETING', 'OFFICE', 'OTHER');

-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "type" "organization_type" NOT NULL DEFAULT 'MINISTRY';

-- CreateTable
CREATE TABLE "organization_address" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID,

    CONSTRAINT "organization_address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "address" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "address_type" NOT NULL,
    "name" TEXT,
    "query" TEXT,
    "geocodingJson" JSONB,
    "country" TEXT,
    "locality" TEXT,
    "region" TEXT,
    "postOfficeBoxNumber" TEXT,
    "postalCode" TEXT,
    "streetAddress" TEXT,

    CONSTRAINT "address_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "organization_address" ADD CONSTRAINT "organization_address_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
