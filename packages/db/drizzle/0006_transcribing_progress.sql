ALTER TABLE "upload_record" ADD COLUMN "transcribing_progress" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Backfill: uploads with a completed transcription are 100% done.
UPDATE "upload_record" SET "transcribing_progress" = 1 WHERE "transcribing_finished_at" IS NOT NULL;