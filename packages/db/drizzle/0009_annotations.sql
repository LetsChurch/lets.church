CREATE TYPE "public"."annotation_kind" AS ENUM('OUTLINE', 'BIBLE', 'KEYWORD');--> statement-breakpoint
CREATE TABLE "annotation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"paragraph_id" uuid NOT NULL,
	"kind" "annotation_kind" NOT NULL,
	"start_word" integer,
	"end_word" integer,
	"text" text NOT NULL,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "annotation" ADD CONSTRAINT "annotation_paragraph_fkey" FOREIGN KEY ("paragraph_id") REFERENCES "public"."transcript_paragraph"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "annotation_paragraph_kind_idx" ON "annotation" USING btree ("paragraph_id","kind");