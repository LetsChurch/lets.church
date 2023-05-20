-- DropForeignKey
ALTER TABLE "upload_record_download_size" DROP CONSTRAINT "upload_record_download_size_uplaod_record_id_fkey";

-- AddForeignKey
ALTER TABLE "upload_record_download_size" ADD CONSTRAINT "upload_record_download_size_uplaod_record_id_fkey" FOREIGN KEY ("uplaod_record_id") REFERENCES "upload_record"("id") ON DELETE CASCADE ON UPDATE CASCADE;
