-- DropForeignKey
ALTER TABLE "upload_list_entry" DROP CONSTRAINT "upload_list_entry_upload_record_id_fkey";

-- DropForeignKey
ALTER TABLE "upload_view" DROP CONSTRAINT "upload_view_upload_record_id_fkey";

-- AddForeignKey
ALTER TABLE "upload_view" ADD CONSTRAINT "upload_view_upload_record_id_fkey" FOREIGN KEY ("upload_record_id") REFERENCES "upload_record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_list_entry" ADD CONSTRAINT "upload_list_entry_upload_record_id_fkey" FOREIGN KEY ("upload_record_id") REFERENCES "upload_record"("id") ON DELETE CASCADE ON UPDATE CASCADE;
