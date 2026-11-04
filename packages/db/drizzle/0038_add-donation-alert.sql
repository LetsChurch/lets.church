CREATE TYPE "public"."donation_alert_kind" AS ENUM('CHECKOUT_PAYMENT_FAILED', 'RENEWAL_PAYMENT_FAILED', 'WEBHOOK_FAILED');--> statement-breakpoint
CREATE TABLE "donation_alert" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "donation_alert_kind" NOT NULL,
	"stripe_object_id" text NOT NULL,
	"stripe_checkout_session_id" text,
	"subscription_id" uuid,
	"amount_cents" integer,
	"currency" text,
	"message" text,
	"occurrences" integer DEFAULT 1 NOT NULL,
	"livemode" boolean NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"last_seen_at" timestamp (3) DEFAULT now() NOT NULL,
	"resolved_at" timestamp (3),
	CONSTRAINT "donation_alert_stripe_object_id_unique" UNIQUE("stripe_object_id")
);
--> statement-breakpoint
ALTER TABLE "donation_alert" ADD CONSTRAINT "donation_alert_subscription_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."donation_subscription"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "donation_alert_checkout_session_idx" ON "donation_alert" USING btree ("stripe_checkout_session_id");--> statement-breakpoint
CREATE INDEX "donation_alert_resolved_at_idx" ON "donation_alert" USING btree ("resolved_at");