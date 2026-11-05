CREATE TABLE "study_guide" (
	"upload_record_id" uuid PRIMARY KEY NOT NULL,
	"content" jsonb NOT NULL,
	"version" integer NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "study_guide" ADD CONSTRAINT "study_guide_uploadRecord_fkey" FOREIGN KEY ("upload_record_id") REFERENCES "public"."upload_record"("id") ON DELETE cascade ON UPDATE cascade;