CREATE TABLE "app_user_pending_email" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_user_id" uuid NOT NULL,
	"email" "citext" NOT NULL,
	"key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_pending_email_app_user_id_unique" UNIQUE("app_user_id")
);
--> statement-breakpoint
ALTER TABLE "app_user_pending_email" ADD CONSTRAINT "app_user_pending_email_appUser_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE cascade;