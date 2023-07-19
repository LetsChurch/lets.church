/*
  Warnings:

  - The primary key for the `upload_view` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "upload_view" DROP CONSTRAINT "upload_view_pkey",
ALTER COLUMN "view_hash" SET DATA TYPE BIGINT,
ADD CONSTRAINT "upload_view_pkey" PRIMARY KEY ("upload_record_id", "view_hash");
