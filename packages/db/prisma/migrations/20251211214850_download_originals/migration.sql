-- AlterTable
ALTER TABLE "channel_membership" ADD COLUMN     "can_download" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "upload_record" ADD COLUMN     "original_file_name" TEXT;
