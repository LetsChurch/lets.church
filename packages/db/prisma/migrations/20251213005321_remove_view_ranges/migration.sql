/*
  Warnings:

  - You are about to drop the `upload_view_ranges` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "upload_view_ranges" DROP CONSTRAINT "upload_view_ranges_app_user_id_fkey";

-- DropForeignKey
ALTER TABLE "upload_view_ranges" DROP CONSTRAINT "upload_view_ranges_upload_record_id_fkey";

-- DropTable
DROP TABLE "upload_view_ranges";
