-- AlterTable
ALTER TABLE upload_record RENAME COLUMN downloads_disabled TO downloads_enabled;
ALTER TABLE upload_record RENAME COLUMN user_comments_disabled TO user_comments_enabled;
