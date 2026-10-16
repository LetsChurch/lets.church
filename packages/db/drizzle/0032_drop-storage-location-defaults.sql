ALTER TABLE "app_user" ALTER COLUMN "avatar_location" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "channel" ALTER COLUMN "avatar_location" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "channel" ALTER COLUMN "cover_location" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "channel" ALTER COLUMN "default_thumbnail_location" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "organization" ALTER COLUMN "avatar_location" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "organization" ALTER COLUMN "cover_location" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "upload_record" ALTER COLUMN "storage_location" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "upload_state" ALTER COLUMN "storage_location" DROP DEFAULT;