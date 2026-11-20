ALTER TABLE "upload_record" ADD COLUMN "auto_thumbnail_path" text;--> statement-breakpoint
ALTER TABLE "upload_record" ADD COLUMN "auto_thumbnail_blurhash" text;--> statement-breakpoint
ALTER TABLE "upload_record" ADD COLUMN "custom_thumbnail_path" text;--> statement-breakpoint
ALTER TABLE "upload_record" ADD COLUMN "custom_thumbnail_blurhash" text;--> statement-breakpoint
ALTER TABLE "upload_record" ADD COLUMN "use_channel_default_thumbnail" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "upload_record" ADD COLUMN "thumbnail_chosen_at" timestamp (3);