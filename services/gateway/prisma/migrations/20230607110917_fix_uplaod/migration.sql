/*
  Warnings:

  - You are about to drop the column `uplaod_record_id` on the `upload_record_download_size` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[upload_record_id,variant]` on the table `upload_record_download_size` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `upload_record_id` to the `upload_record_download_size` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "upload_record_download_size" DROP CONSTRAINT "upload_record_download_size_uplaod_record_id_fkey";

-- DropIndex
DROP INDEX "upload_record_download_size_uplaod_record_id_variant_key";

-- AlterTable
ALTER TABLE "upload_record_download_size" RENAME COLUMN "uplaod_record_id" to "upload_record_id";

-- CreateIndex
CREATE UNIQUE INDEX "upload_record_download_size_upload_record_id_variant_key" ON "upload_record_download_size"("upload_record_id", "variant");

-- AddForeignKey
ALTER TABLE "upload_record_download_size" ADD CONSTRAINT "upload_record_download_size_upload_record_id_fkey" FOREIGN KEY ("upload_record_id") REFERENCES "upload_record"("id") ON DELETE CASCADE ON UPDATE CASCADE;
