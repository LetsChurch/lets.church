-- DropIndex
DROP INDEX "public"."search_log_entry_app_user_id_created_at_idx";

-- CreateIndex
CREATE INDEX "search_log_entry_app_user_id_user_deleted_at_created_at_idx" ON "search_log_entry"("app_user_id", "user_deleted_at", "created_at" DESC);
