CREATE TYPE "public"."storage_image_owner" AS ENUM('APP_USER', 'CHANNEL', 'ORGANIZATION');--> statement-breakpoint
CREATE TYPE "public"."storage_move_kind" AS ENUM('UPLOAD_RECORD', 'IMAGES', 'REBALANCE');--> statement-breakpoint
CREATE TYPE "public"."storage_move_status" AS ENUM('PENDING', 'COPYING', 'GRACE', 'CLEANING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "storage_location_policy" (
	"location_id" text PRIMARY KEY NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"accepting_uploads" boolean DEFAULT true NOT NULL,
	"updated_by_id" uuid,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_move" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "storage_move_kind" NOT NULL,
	"status" "storage_move_status" DEFAULT 'PENDING' NOT NULL,
	"parent_id" uuid,
	"source_location" text NOT NULL,
	"target_location" text,
	"upload_record_id" uuid,
	"image_owner" "storage_image_owner",
	"image_owner_id" uuid,
	"goal" jsonb,
	"total_bytes" bigint DEFAULT 0 NOT NULL,
	"copied_bytes" bigint DEFAULT 0 NOT NULL,
	"total_items" integer DEFAULT 0 NOT NULL,
	"completed_items" integer DEFAULT 0 NOT NULL,
	"failed_items" integer DEFAULT 0 NOT NULL,
	"workflow_id" text,
	"triggered_by_id" uuid,
	"error" text,
	"started_at" timestamp (3),
	"finished_at" timestamp (3),
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "avatar_location" text DEFAULT 'idrive';--> statement-breakpoint
ALTER TABLE "channel" ADD COLUMN "avatar_location" text DEFAULT 'idrive';--> statement-breakpoint
ALTER TABLE "channel" ADD COLUMN "cover_location" text DEFAULT 'idrive';--> statement-breakpoint
ALTER TABLE "channel" ADD COLUMN "default_thumbnail_location" text DEFAULT 'idrive';--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "avatar_location" text DEFAULT 'idrive';--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "cover_location" text DEFAULT 'idrive';--> statement-breakpoint
ALTER TABLE "upload_record" ADD COLUMN "storage_location" text DEFAULT 'idrive' NOT NULL;--> statement-breakpoint
ALTER TABLE "upload_record" ADD COLUMN "public_size_bytes" bigint;--> statement-breakpoint
ALTER TABLE "upload_record" ADD COLUMN "public_reserved_bytes" bigint;--> statement-breakpoint
ALTER TABLE "upload_record" ADD COLUMN "storage_move_id" uuid;--> statement-breakpoint
ALTER TABLE "upload_record" ADD COLUMN "storage_waiting_since" timestamp (3);--> statement-breakpoint
ALTER TABLE "upload_state" ADD COLUMN "storage_location" text DEFAULT 'idrive' NOT NULL;--> statement-breakpoint
ALTER TABLE "storage_location_policy" ADD CONSTRAINT "storage_location_policy_updated_by_id_app_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_move" ADD CONSTRAINT "storage_move_parent_id_storage_move_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."storage_move"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_move" ADD CONSTRAINT "storage_move_upload_record_id_upload_record_id_fk" FOREIGN KEY ("upload_record_id") REFERENCES "public"."upload_record"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_move" ADD CONSTRAINT "storage_move_triggered_by_id_app_user_id_fk" FOREIGN KEY ("triggered_by_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "storage_move_parent_idx" ON "storage_move" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "storage_move_status_idx" ON "storage_move" USING btree ("status");--> statement-breakpoint
ALTER TABLE "upload_record" ADD CONSTRAINT "upload_record_storageMove_fkey" FOREIGN KEY ("storage_move_id") REFERENCES "public"."storage_move"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "upload_record_storage_location_idx" ON "upload_record" USING btree ("storage_location");--> statement-breakpoint
CREATE INDEX "upload_state_storage_location_idx" ON "upload_state" USING btree ("storage_location");