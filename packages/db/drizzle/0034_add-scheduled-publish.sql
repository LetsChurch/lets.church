ALTER TABLE "upload_record" ADD COLUMN "scheduled_publish_at" timestamp (3);--> statement-breakpoint
ALTER TABLE "upload_record" ADD COLUMN "scheduled_visibility" "upload_visibility";