ALTER TABLE "donation_subscription" ADD COLUMN "exclude_from_budget" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "donation_subscription" DROP COLUMN "budget_offset_cents";--> statement-breakpoint
ALTER TABLE "donation_subscription" DROP COLUMN "budget_offset_note";