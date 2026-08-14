CREATE TYPE "public"."channel_import_history_batch_status" AS ENUM('PENDING', 'RUNNING', 'DONE', 'FAILED');--> statement-breakpoint
CREATE TABLE "channel_import_history_batch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_source_id" uuid NOT NULL,
	"status" "channel_import_history_batch_status" DEFAULT 'PENDING' NOT NULL,
	"total_items" integer NOT NULL,
	"processed_items" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"started_at" timestamp (3),
	"completed_at" timestamp (3),
	"failed_at" timestamp (3),
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL,
	CONSTRAINT "channel_import_history_batch_progress_check" CHECK ("channel_import_history_batch"."processed_items" >= 0 and "channel_import_history_batch"."processed_items" <= "channel_import_history_batch"."total_items")
);
--> statement-breakpoint
CREATE TABLE "channel_import_history_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"import_source_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"published_at" timestamp (3) NOT NULL,
	"source" text,
	"title" text NOT NULL,
	"description" text,
	"url" text,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "channel_import_history_item_ordinal_check" CHECK ("channel_import_history_item"."ordinal" >= 0)
);
--> statement-breakpoint
ALTER TABLE "import_history" ADD COLUMN "staged_item_id" uuid;--> statement-breakpoint
ALTER TABLE "channel_import_history_batch" ADD CONSTRAINT "channel_import_history_batch_import_source_fkey" FOREIGN KEY ("import_source_id") REFERENCES "public"."channel_import_source"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "channel_import_history_item" ADD CONSTRAINT "channel_import_history_item_batch_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."channel_import_history_batch"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "channel_import_history_item" ADD CONSTRAINT "channel_import_history_item_import_source_fkey" FOREIGN KEY ("import_source_id") REFERENCES "public"."channel_import_source"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "channel_import_history_batch_source_created_idx" ON "channel_import_history_batch" USING btree ("import_source_id","created_at");--> statement-breakpoint
CREATE INDEX "channel_import_history_batch_status_idx" ON "channel_import_history_batch" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_import_history_item_batch_ordinal_uidx" ON "channel_import_history_item" USING btree ("batch_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "import_history_staged_item_id_uidx" ON "import_history" USING btree ("staged_item_id");