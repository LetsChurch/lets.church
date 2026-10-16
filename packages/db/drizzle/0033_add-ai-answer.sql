CREATE TYPE "public"."ai_answer_source" AS ENUM('SEARCH', 'DIG_DEEPER');--> statement-breakpoint
CREATE TABLE "ai_answer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "ai_answer_source" NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"sources" jsonb DEFAULT '[]' NOT NULL,
	"model" text NOT NULL,
	"upload_record_id" uuid,
	"app_user_id" uuid,
	"resource_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"rating" "rating",
	"rated_at" timestamp (3),
	"created_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_answer" ADD CONSTRAINT "ai_answer_appUser_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ai_answer" ADD CONSTRAINT "ai_answer_uploadRecord_fkey" FOREIGN KEY ("upload_record_id") REFERENCES "public"."upload_record"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "ai_answer_created_at_idx" ON "ai_answer" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_answer_source_rating_rated_at_idx" ON "ai_answer" USING btree ("source","rating","rated_at" DESC NULLS LAST);