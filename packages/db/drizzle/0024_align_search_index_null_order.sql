DROP INDEX "search_log_entry_app_user_id_user_deleted_at_created_at_idx";--> statement-breakpoint
DROP INDEX "search_log_entry_created_at_idx";--> statement-breakpoint
CREATE INDEX "search_log_entry_app_user_id_user_deleted_at_created_at_idx" ON "search_log_entry" USING btree ("app_user_id","user_deleted_at","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "search_log_entry_created_at_idx" ON "search_log_entry" USING btree ("created_at" DESC NULLS FIRST);