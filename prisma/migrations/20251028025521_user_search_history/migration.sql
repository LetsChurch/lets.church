-- AlterTable
ALTER TABLE "search_log_entry" ADD COLUMN     "app_user_id" UUID,
ADD COLUMN     "user_deleted_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "search_log_entry_app_user_id_created_at_idx" ON "search_log_entry"("app_user_id", "created_at");

-- AddForeignKey
ALTER TABLE "search_log_entry" ADD CONSTRAINT "search_log_entry_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
