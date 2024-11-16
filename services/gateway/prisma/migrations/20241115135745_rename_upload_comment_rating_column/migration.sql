ALTER TABLE "upload_user_comment_rating" RENAME COLUMN "upload_id" TO "upload_user_comment_id";
ALTER TABLE "upload_user_comment_rating" RENAME CONSTRAINT "upload_user_comment_rating_upload_id_fkey" TO "upload_user_comment_rating_upload_user_comment_id_fkey";
ALTER INDEX "upload_user_comment_rating_upload_id_rating_idx" RENAME TO "upload_user_comment_rating_upload_user_comment_id_rating_idx";
