ALTER TYPE "public"."app_auth_token_type" ADD VALUE 'REGISTRATION';--> statement-breakpoint
ALTER TABLE "app_auth_token" ADD COLUMN "payload" jsonb;