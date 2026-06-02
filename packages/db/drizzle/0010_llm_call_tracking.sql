CREATE TABLE "llm_call" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model" text NOT NULL,
	"activity" text NOT NULL,
	"upload_record_id" uuid,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"cached_tokens" integer,
	"computed_cost_usd" numeric(18, 8),
	"provider_cost_usd" numeric(18, 8),
	"duration_ms" integer NOT NULL,
	"finish_reason" text,
	"outcome" text DEFAULT 'success' NOT NULL,
	"error_message" text,
	"via_batch" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "llm_call" ADD CONSTRAINT "llm_call_uploadRecord_fkey" FOREIGN KEY ("upload_record_id") REFERENCES "public"."upload_record"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "llm_call_created_at_idx" ON "llm_call" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "llm_call_model_created_at_idx" ON "llm_call" USING btree ("model","created_at");--> statement-breakpoint
CREATE INDEX "llm_call_activity_created_at_idx" ON "llm_call" USING btree ("activity","created_at");--> statement-breakpoint
CREATE INDEX "llm_call_upload_record_id_idx" ON "llm_call" USING btree ("upload_record_id");--> statement-breakpoint
CREATE INDEX "llm_call_outcome_created_at_idx" ON "llm_call" USING btree ("outcome","created_at");