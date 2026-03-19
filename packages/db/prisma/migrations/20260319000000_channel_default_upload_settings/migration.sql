-- AlterTable
ALTER TABLE "channel" ADD COLUMN     "default_upload_comments_enabled" BOOLEAN,
ADD COLUMN     "default_upload_downloads_enabled" BOOLEAN,
ADD COLUMN     "default_upload_license" "upload_license",
ADD COLUMN     "default_upload_visibility" "upload_visibility";
