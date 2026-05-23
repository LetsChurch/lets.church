CREATE TABLE "transcript_paragraph" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"upload_record_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"start" double precision NOT NULL,
	"end" double precision NOT NULL,
	"speaker" text,
	"speaker_embedding" jsonb,
	"text" text NOT NULL,
	"words" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transcript_paragraph" ADD CONSTRAINT "transcript_paragraph_uploadRecord_fkey" FOREIGN KEY ("upload_record_id") REFERENCES "public"."upload_record"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "transcript_paragraph_upload_record_id_order_idx" ON "transcript_paragraph" USING btree ("upload_record_id","order");