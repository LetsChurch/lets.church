CREATE TABLE "oidc_authorization_code" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" text NOT NULL,
	"app_user_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"scope" text NOT NULL,
	"nonce" text,
	"code_challenge" text NOT NULL,
	"code_challenge_method" text DEFAULT 'S256' NOT NULL,
	"auth_time" timestamp (3) NOT NULL,
	"expires_at" timestamp (3) NOT NULL,
	"consumed_at" timestamp (3),
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "oidc_authorization_code_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "oidc_refresh_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"family_id" uuid NOT NULL,
	"app_user_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"scope" text NOT NULL,
	"auth_time" timestamp (3) NOT NULL,
	"expires_at" timestamp (3) NOT NULL,
	"rotated_at" timestamp (3),
	"revoked_at" timestamp (3),
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "oidc_refresh_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "oidc_authorization_code" ADD CONSTRAINT "oidc_authorization_code_appUser_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "oidc_refresh_token" ADD CONSTRAINT "oidc_refresh_token_appUser_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "oidc_refresh_token_family_idx" ON "oidc_refresh_token" USING btree ("family_id");