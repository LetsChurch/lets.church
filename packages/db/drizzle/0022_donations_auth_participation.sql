CREATE TYPE "public"."app_auth_token_type" AS ENUM('EMAIL_SIGN_IN', 'PASSWORD_RESET');--> statement-breakpoint
CREATE TYPE "public"."donation_checkout_status" AS ENUM('OPEN', 'COMPLETED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."donation_frequency" AS ENUM('ONE_TIME', 'MONTHLY', 'QUARTERLY', 'YEARLY');--> statement-breakpoint
CREATE TYPE "public"."donation_import_status" AS ENUM('VALIDATED', 'RUNNING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."donation_import_type" AS ENUM('TRANSACTION_HISTORY', 'RECURRING_PLANS');--> statement-breakpoint
CREATE TYPE "public"."donation_source" AS ENUM('STRIPE', 'IMPORT');--> statement-breakpoint
CREATE TYPE "public"."donation_status" AS ENUM('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED');--> statement-breakpoint
CREATE TYPE "public"."donation_subscription_status" AS ENUM('INCOMPLETE', 'INCOMPLETE_EXPIRED', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID', 'PAUSED');--> statement-breakpoint
CREATE TABLE "app_auth_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "app_auth_token_type" NOT NULL,
	"token_hash" text NOT NULL,
	"email" text NOT NULL,
	"app_user_id" uuid,
	"return_to" text,
	"expires_at" timestamp (3) NOT NULL,
	"consumed_at" timestamp (3),
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "app_auth_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "donation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"donor_id" uuid NOT NULL,
	"checkout_id" uuid,
	"subscription_id" uuid,
	"source" "donation_source" NOT NULL,
	"external_id" text NOT NULL,
	"frequency" "donation_frequency" NOT NULL,
	"status" "donation_status" NOT NULL,
	"base_amount_cents" integer NOT NULL,
	"fee_coverage_cents" integer DEFAULT 0 NOT NULL,
	"amount_cents" integer NOT NULL,
	"processing_fee_cents" integer,
	"net_amount_cents" integer,
	"refunded_amount_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"stripe_payment_intent_id" text,
	"stripe_charge_id" text,
	"stripe_invoice_id" text,
	"receipt_url" text,
	"dispute_status" text,
	"donated_at" timestamp (3) NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL,
	CONSTRAINT "donation_external_id_unique" UNIQUE("external_id"),
	CONSTRAINT "donation_stripe_payment_intent_id_unique" UNIQUE("stripe_payment_intent_id"),
	CONSTRAINT "donation_stripe_charge_id_unique" UNIQUE("stripe_charge_id"),
	CONSTRAINT "donation_stripe_invoice_id_unique" UNIQUE("stripe_invoice_id"),
	CONSTRAINT "donation_amount_positive" CHECK ("donation"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "donation_checkout" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"donor_id" uuid NOT NULL,
	"stripe_checkout_session_id" text,
	"frequency" "donation_frequency" NOT NULL,
	"base_amount_cents" integer NOT NULL,
	"fee_coverage_cents" integer DEFAULT 0 NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"status" "donation_checkout_status" DEFAULT 'OPEN' NOT NULL,
	"expires_at" timestamp (3),
	"completed_at" timestamp (3),
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL,
	CONSTRAINT "donation_checkout_stripe_checkout_session_id_unique" UNIQUE("stripe_checkout_session_id"),
	CONSTRAINT "donation_checkout_amount_positive" CHECK ("donation_checkout"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "donation_donor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_user_id" uuid,
	"email" text,
	"name" text,
	"stripe_customer_id" text,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL,
	CONSTRAINT "donation_donor_email_unique" UNIQUE("email"),
	CONSTRAINT "donation_donor_stripe_customer_id_unique" UNIQUE("stripe_customer_id")
);
--> statement-breakpoint
CREATE TABLE "donation_import_batch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "donation_import_type" NOT NULL,
	"status" "donation_import_status" NOT NULL,
	"filename" text NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"ready_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"imported_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL,
	"completed_at" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "donation_subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"donor_id" uuid NOT NULL,
	"checkout_id" uuid,
	"legacy_external_id" text,
	"stripe_subscription_id" text NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"stripe_price_id" text,
	"frequency" "donation_frequency" DEFAULT 'MONTHLY' NOT NULL,
	"status" "donation_subscription_status" NOT NULL,
	"base_amount_cents" integer NOT NULL,
	"fee_coverage_cents" integer DEFAULT 0 NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"current_period_start" timestamp (3),
	"current_period_end" timestamp (3),
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"canceled_at" timestamp (3),
	"ended_at" timestamp (3),
	"last_payment_failed_at" timestamp (3),
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL,
	CONSTRAINT "donation_subscription_checkout_id_unique" UNIQUE("checkout_id"),
	CONSTRAINT "donation_subscription_legacy_external_id_unique" UNIQUE("legacy_external_id"),
	CONSTRAINT "donation_subscription_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "donation_webhook_event" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"stripe_created_at" timestamp (3) NOT NULL,
	"processed_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_user" ALTER COLUMN "password" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "app_auth_token" ADD CONSTRAINT "app_auth_token_appUser_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "donation" ADD CONSTRAINT "donation_donor_fkey" FOREIGN KEY ("donor_id") REFERENCES "public"."donation_donor"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "donation" ADD CONSTRAINT "donation_checkout_fkey" FOREIGN KEY ("checkout_id") REFERENCES "public"."donation_checkout"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "donation" ADD CONSTRAINT "donation_subscription_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."donation_subscription"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "donation_checkout" ADD CONSTRAINT "donation_checkout_donor_fkey" FOREIGN KEY ("donor_id") REFERENCES "public"."donation_donor"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "donation_donor" ADD CONSTRAINT "donation_donor_appUser_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "donation_import_batch" ADD CONSTRAINT "donation_import_batch_createdBy_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."app_user"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "donation_subscription" ADD CONSTRAINT "donation_subscription_donor_fkey" FOREIGN KEY ("donor_id") REFERENCES "public"."donation_donor"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "donation_subscription" ADD CONSTRAINT "donation_subscription_checkout_fkey" FOREIGN KEY ("checkout_id") REFERENCES "public"."donation_checkout"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "app_auth_token_email_createdAt_idx" ON "app_auth_token" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "app_auth_token_expiresAt_idx" ON "app_auth_token" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "donation_donorId_donatedAt_idx" ON "donation" USING btree ("donor_id","donated_at");--> statement-breakpoint
CREATE INDEX "donation_status_donatedAt_idx" ON "donation" USING btree ("status","donated_at");--> statement-breakpoint
CREATE INDEX "donation_donor_appUserId_idx" ON "donation_donor" USING btree ("app_user_id");--> statement-breakpoint
CREATE INDEX "donation_import_batch_createdAt_idx" ON "donation_import_batch" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "donation_subscription_donorId_idx" ON "donation_subscription" USING btree ("donor_id");
--> statement-breakpoint
CREATE TABLE "donation_payment_adjustment" (
	"stripe_charge_id" text PRIMARY KEY NOT NULL,
	"stripe_payment_intent_id" text,
	"charge_amount_cents" integer,
	"refunded_amount_cents" integer,
	"dispute_status" text,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL,
	CONSTRAINT "donation_payment_adjustment_amounts_valid" CHECK (("donation_payment_adjustment"."charge_amount_cents" is null or "donation_payment_adjustment"."charge_amount_cents" > 0)
        and ("donation_payment_adjustment"."refunded_amount_cents" is null or "donation_payment_adjustment"."refunded_amount_cents" >= 0)
        and ("donation_payment_adjustment"."charge_amount_cents" is null
          or "donation_payment_adjustment"."refunded_amount_cents" is null
          or "donation_payment_adjustment"."refunded_amount_cents" <= "donation_payment_adjustment"."charge_amount_cents"))
);
--> statement-breakpoint
CREATE INDEX "donation_payment_adjustment_paymentIntent_idx" ON "donation_payment_adjustment" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX "donation_checkout_donorId_idx" ON "donation_checkout" USING btree ("donor_id");--> statement-breakpoint
ALTER TABLE "donation" ADD CONSTRAINT "donation_amounts_consistent" CHECK ("donation"."base_amount_cents" > 0
        and "donation"."fee_coverage_cents" >= 0
        and "donation"."amount_cents" = "donation"."base_amount_cents" + "donation"."fee_coverage_cents"
        and "donation"."refunded_amount_cents" >= 0
        and "donation"."refunded_amount_cents" <= "donation"."amount_cents");--> statement-breakpoint
ALTER TABLE "donation" ADD CONSTRAINT "donation_fees_nonnegative" CHECK (("donation"."processing_fee_cents" is null or "donation"."processing_fee_cents" >= 0)
        and ("donation"."net_amount_cents" is null or "donation"."net_amount_cents" >= 0));--> statement-breakpoint
ALTER TABLE "donation_checkout" ADD CONSTRAINT "donation_checkout_amounts_consistent" CHECK ("donation_checkout"."base_amount_cents" > 0
        and "donation_checkout"."fee_coverage_cents" >= 0
        and "donation_checkout"."amount_cents" = "donation_checkout"."base_amount_cents" + "donation_checkout"."fee_coverage_cents");--> statement-breakpoint
ALTER TABLE "donation_import_batch" ADD CONSTRAINT "donation_import_batch_counts_nonnegative" CHECK ("donation_import_batch"."row_count" >= 0
        and "donation_import_batch"."ready_count" >= 0
        and "donation_import_batch"."skipped_count" >= 0
        and "donation_import_batch"."imported_count" >= 0
        and "donation_import_batch"."duplicate_count" >= 0);--> statement-breakpoint
ALTER TABLE "donation_subscription" ADD CONSTRAINT "donation_subscription_recurring_frequency" CHECK ("donation_subscription"."frequency" <> 'ONE_TIME');--> statement-breakpoint
ALTER TABLE "donation_subscription" ADD CONSTRAINT "donation_subscription_amounts_consistent" CHECK ("donation_subscription"."base_amount_cents" > 0
        and "donation_subscription"."fee_coverage_cents" >= 0
        and "donation_subscription"."amount_cents" = "donation_subscription"."base_amount_cents" + "donation_subscription"."fee_coverage_cents");
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "citext";
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "app_user"
		GROUP BY lower(btrim("username"::text))
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION 'Cannot restore citext for app_user.username: case-insensitive duplicates or surrounding-whitespace variants must be resolved first';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "app_user_email"
		GROUP BY lower(btrim("email"::text))
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION 'Cannot restore citext for app_user_email.email: case-insensitive duplicates or surrounding-whitespace variants must be resolved first';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "channel"
		GROUP BY lower(btrim("slug"::text))
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION 'Cannot restore citext for channel.slug: case-insensitive duplicates or surrounding-whitespace variants must be resolved first';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "channel_invitation"
		GROUP BY "channel_id", lower(btrim("email"::text))
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION 'Cannot restore citext for channel_invitation.email: case-insensitive duplicates or surrounding-whitespace variants within a channel must be resolved first';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "donation_donor"
		WHERE "email" IS NOT NULL
		GROUP BY lower(btrim("email"::text))
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION 'Cannot restore citext for donation_donor.email: case-insensitive duplicates or surrounding-whitespace variants must be resolved first';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "organization"
		GROUP BY lower(btrim("slug"::text))
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION 'Cannot restore citext for organization.slug: case-insensitive duplicates or surrounding-whitespace variants must be resolved first';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "organization_invitation"
		GROUP BY "organization_id", lower(btrim("email"::text))
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION 'Cannot restore citext for organization_invitation.email: case-insensitive duplicates or surrounding-whitespace variants within an organization must be resolved first';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "organization_tag"
		GROUP BY lower(btrim("slug"::text))
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION 'Cannot restore citext for organization_tag.slug: case-insensitive duplicates or surrounding-whitespace variants must be resolved first';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "organization_tag_instance"
		GROUP BY "organization_id", lower(btrim("tag_slug"::text))
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION 'Cannot restore citext for organization_tag_instance.tag_slug: case-insensitive duplicates or surrounding-whitespace variants within an organization must be resolved first';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "organization_tag_suggestion"
		GROUP BY
			lower(btrim("parent_slug"::text)),
			lower(btrim("recommended_slug"::text))
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION 'Cannot restore citext for organization_tag_suggestion slugs: case-insensitive duplicates or surrounding-whitespace variants must be resolved first';
	END IF;
END
$$;
--> statement-breakpoint
UPDATE "app_user"
SET "username" = btrim("username"::text)
WHERE "username"::text IS DISTINCT FROM btrim("username"::text);
--> statement-breakpoint
UPDATE "app_user_email"
SET "email" = lower(btrim("email"::text))
WHERE "email"::text IS DISTINCT FROM lower(btrim("email"::text));
--> statement-breakpoint
UPDATE "app_auth_token"
SET "email" = lower(btrim("email"::text))
WHERE "email"::text IS DISTINCT FROM lower(btrim("email"::text));
--> statement-breakpoint
UPDATE "channel"
SET "slug" = btrim("slug"::text)
WHERE "slug"::text IS DISTINCT FROM btrim("slug"::text);
--> statement-breakpoint
UPDATE "channel_invitation"
SET "email" = lower(btrim("email"::text))
WHERE "email"::text IS DISTINCT FROM lower(btrim("email"::text));
--> statement-breakpoint
UPDATE "donation_donor"
SET "email" = lower(btrim("email"::text))
WHERE
	"email" IS NOT NULL
	AND "email"::text IS DISTINCT FROM lower(btrim("email"::text));
--> statement-breakpoint
UPDATE "organization"
SET "slug" = btrim("slug"::text)
WHERE "slug"::text IS DISTINCT FROM btrim("slug"::text);
--> statement-breakpoint
UPDATE "organization_invitation"
SET "email" = lower(btrim("email"::text))
WHERE "email"::text IS DISTINCT FROM lower(btrim("email"::text));
--> statement-breakpoint
UPDATE "organization_tag"
SET "slug" = btrim("slug"::text)
WHERE "slug"::text IS DISTINCT FROM btrim("slug"::text);
--> statement-breakpoint
UPDATE "organization_tag_instance"
SET "tag_slug" = btrim("tag_slug"::text)
WHERE "tag_slug"::text IS DISTINCT FROM btrim("tag_slug"::text);
--> statement-breakpoint
UPDATE "organization_tag_suggestion"
SET
	"parent_slug" = btrim("parent_slug"::text),
	"recommended_slug" = btrim("recommended_slug"::text)
WHERE
	"parent_slug"::text IS DISTINCT FROM btrim("parent_slug"::text)
	OR "recommended_slug"::text IS DISTINCT FROM btrim("recommended_slug"::text);
--> statement-breakpoint
ALTER TABLE "organization_tag_instance"
	DROP CONSTRAINT IF EXISTS "organization_tag_instance_tag_fkey";
--> statement-breakpoint
ALTER TABLE "organization_tag_suggestion"
	DROP CONSTRAINT IF EXISTS "organization_tag_suggestion_parent_fkey";
--> statement-breakpoint
ALTER TABLE "organization_tag_suggestion"
	DROP CONSTRAINT IF EXISTS "organization_tag_suggestion_suggested_fkey";
--> statement-breakpoint
DO $$
DECLARE
	target record;
	existing_type text;
BEGIN
	FOR target IN
		SELECT *
		FROM (
			VALUES
				('app_auth_token', 'email'),
				('app_user', 'username'),
				('app_user_email', 'email'),
				('channel', 'slug'),
				('channel_invitation', 'email'),
				('donation_donor', 'email'),
				('organization', 'slug'),
				('organization_invitation', 'email'),
				('organization_tag', 'slug'),
				('organization_tag_instance', 'tag_slug'),
				('organization_tag_suggestion', 'parent_slug'),
				('organization_tag_suggestion', 'recommended_slug')
		) AS columns_to_convert(table_name, column_name)
	LOOP
		SELECT columns.udt_name
		INTO existing_type
		FROM information_schema.columns
		WHERE
			columns.table_schema = 'public'
			AND columns.table_name = target.table_name
			AND columns.column_name = target.column_name;

		IF existing_type IS NULL THEN
			RAISE EXCEPTION 'Cannot restore citext: %.% does not exist', target.table_name, target.column_name;
		END IF;

		IF existing_type <> 'citext' THEN
			EXECUTE format(
				'ALTER TABLE public.%I ALTER COLUMN %I TYPE citext USING btrim(%I::text)::citext',
				target.table_name,
				target.column_name,
				target.column_name
			);
		END IF;
	END LOOP;
END
$$;
--> statement-breakpoint
ALTER TABLE "organization_tag_instance"
	ADD CONSTRAINT "organization_tag_instance_tag_fkey"
	FOREIGN KEY ("tag_slug")
	REFERENCES "public"."organization_tag"("slug")
	ON DELETE cascade
	ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "organization_tag_suggestion"
	ADD CONSTRAINT "organization_tag_suggestion_parent_fkey"
	FOREIGN KEY ("parent_slug")
	REFERENCES "public"."organization_tag"("slug")
	ON DELETE cascade
	ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "organization_tag_suggestion"
	ADD CONSTRAINT "organization_tag_suggestion_suggested_fkey"
	FOREIGN KEY ("recommended_slug")
	REFERENCES "public"."organization_tag"("slug")
	ON DELETE cascade
	ON UPDATE cascade;
--> statement-breakpoint
DROP INDEX IF EXISTS "app_user_email_email_lower_unique";
--> statement-breakpoint
DROP INDEX IF EXISTS "donation_donor_email_lower_unique";
--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "statement_of_theology_accepted_at" timestamp (3);--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "terms_accepted_at" timestamp (3);
