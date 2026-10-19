CREATE TABLE "donation_budget_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"monthly_amount_cents" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL,
	CONSTRAINT "donation_budget_category_amount_nonnegative" CHECK ("donation_budget_category"."monthly_amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "donation_untracked_gift" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"monthly_amount_cents" integer NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL,
	CONSTRAINT "donation_untracked_gift_amount_positive" CHECK ("donation_untracked_gift"."monthly_amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "donation_subscription" ADD COLUMN "budget_offset_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "donation_subscription" ADD COLUMN "budget_offset_note" text;