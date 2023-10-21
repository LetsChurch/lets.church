/*
  Warnings:

  - You are about to drop the `upload_segment_view` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "upload_segment_view" DROP CONSTRAINT "upload_segment_view_app_user_id_fkey";

-- DropForeignKey
ALTER TABLE "upload_segment_view" DROP CONSTRAINT "upload_segment_view_upload_record_id_fkey";

-- DropTable
DROP TABLE "upload_segment_view";
