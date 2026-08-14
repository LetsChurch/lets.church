ALTER TABLE "user_highlight" ADD COLUMN "deleted_at" timestamp (3);--> statement-breakpoint
ALTER TABLE "user_note" ADD COLUMN "deleted_at" timestamp (3);