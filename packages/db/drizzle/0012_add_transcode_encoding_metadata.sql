CREATE TYPE "public"."transcode_encoder" AS ENUM('libx264', 'h264_ama');--> statement-breakpoint
ALTER TABLE "upload_record" ADD COLUMN "transcode_encoder" "transcode_encoder";--> statement-breakpoint
ALTER TABLE "upload_record" ADD COLUMN "split_audio" boolean DEFAULT false NOT NULL;