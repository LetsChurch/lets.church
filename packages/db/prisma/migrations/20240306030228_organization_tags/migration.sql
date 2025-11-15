/*
  Warnings:

  - You are about to drop the column `denomination` on the `organization` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "TagColor" AS ENUM ('GRAY', 'RED', 'YELLOW', 'GREEN', 'BLUE', 'INDIGO', 'PURPLE', 'PINK');

-- CreateEnum
CREATE TYPE "organization_tag_category" AS ENUM ('DENOMINATION', 'DOCTRINE', 'ESCHATOLOGY', 'WORSHIP', 'CONFESSION', 'GOVERNMENT', 'OTHER');

-- AlterTable
ALTER TABLE "organization" DROP COLUMN "denomination";

-- DropEnum
DROP TYPE "organization_denomination";

-- CreateTable
CREATE TABLE "organization_tag" (
    "slug" CITEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "more_info_link" TEXT,
    "category" "organization_tag_category" NOT NULL,
    "color" "TagColor" NOT NULL DEFAULT 'GRAY'
);

-- CreateTable
CREATE TABLE "organization_tag_suggestion" (
    "parent_slug" CITEXT NOT NULL,
    "recommended_slug" CITEXT NOT NULL,

    CONSTRAINT "organization_tag_suggestion_pkey" PRIMARY KEY ("parent_slug","recommended_slug")
);

-- CreateTable
CREATE TABLE "organization_tag_instance" (
    "organization_id" UUID NOT NULL,
    "tag_slug" CITEXT NOT NULL,

    CONSTRAINT "organization_tag_instance_pkey" PRIMARY KEY ("organization_id","tag_slug")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_tag_slug_key" ON "organization_tag"("slug");

-- AddForeignKey
ALTER TABLE "organization_tag_suggestion" ADD CONSTRAINT "organization_tag_suggestion_parent_slug_fkey" FOREIGN KEY ("parent_slug") REFERENCES "organization_tag"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_tag_suggestion" ADD CONSTRAINT "organization_tag_suggestion_recommended_slug_fkey" FOREIGN KEY ("recommended_slug") REFERENCES "organization_tag"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_tag_instance" ADD CONSTRAINT "organization_tag_instance_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_tag_instance" ADD CONSTRAINT "organization_tag_instance_tag_slug_fkey" FOREIGN KEY ("tag_slug") REFERENCES "organization_tag"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;
