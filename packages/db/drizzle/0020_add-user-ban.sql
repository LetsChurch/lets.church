ALTER TABLE "app_user" ADD COLUMN "banned_at" timestamp (3);--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "ban_reason" text;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "banned_by_id" uuid;--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_banned_by_id_app_user_id_fk" FOREIGN KEY ("banned_by_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;