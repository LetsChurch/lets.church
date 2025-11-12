-- CreateEnum
CREATE TYPE "organization_leader_type" AS ENUM ('ELDER', 'DEACON', 'OTHER');

-- CreateTable
CREATE TABLE "organization_leader" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "type" "organization_leader_type" NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone_number" TEXT,

    CONSTRAINT "organization_leader_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "organization_leader" ADD CONSTRAINT "organization_leader_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
