CREATE TYPE "public"."storage_audit_status" AS ENUM('RUNNING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TABLE "storage_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "storage_audit_status" DEFAULT 'RUNNING' NOT NULL,
	"triggered_by_id" uuid,
	"started_at" timestamp (3) DEFAULT now() NOT NULL,
	"finished_at" timestamp (3),
	"summary" jsonb,
	"report_s3_key" text,
	"error" text,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "storage_audit" ADD CONSTRAINT "storage_audit_triggeredBy_fkey" FOREIGN KEY ("triggered_by_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE cascade;