CREATE TABLE "transcript_window" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"upload_record_id" uuid NOT NULL,
	"start_order" integer NOT NULL,
	"end_order" integer NOT NULL,
	"start" double precision NOT NULL,
	"end" double precision NOT NULL,
	"text_hash" text NOT NULL,
	"embedding" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transcript_window" ADD CONSTRAINT "transcript_window_uploadRecord_fkey" FOREIGN KEY ("upload_record_id") REFERENCES "public"."upload_record"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "transcript_window_upload_record_id_start_order_idx" ON "transcript_window" USING btree ("upload_record_id","start_order");