ALTER TABLE "transcript_paragraph" ADD COLUMN "embedding" jsonb;--> statement-breakpoint
ALTER TABLE "upload_record" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "upload_record" ADD COLUMN "search_summary" text;--> statement-breakpoint
ALTER TABLE "upload_record" ADD COLUMN "summary_embedding" jsonb;--> statement-breakpoint
ALTER TABLE "upload_record" ADD COLUMN "search_summary_embedding" jsonb;--> statement-breakpoint
ALTER TABLE "upload_record" ADD COLUMN "summarized_at" timestamp (3);--> statement-breakpoint
ALTER TABLE "upload_record" ADD COLUMN "sections" jsonb DEFAULT '[]'::jsonb NOT NULL;