CREATE TYPE "public"."donation_year_end_statement_status" AS ENUM('SENT', 'UNDELIVERABLE');--> statement-breakpoint
CREATE TABLE "donation_year_end_statement" (
	"donor_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"status" "donation_year_end_statement_status" DEFAULT 'SENT' NOT NULL,
	"sent_at" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "DonationYearEndStatement_cpk" PRIMARY KEY("donor_id","year")
);
--> statement-breakpoint
ALTER TABLE "donation_year_end_statement" ADD CONSTRAINT "donation_year_end_statement_donor_fkey" FOREIGN KEY ("donor_id") REFERENCES "public"."donation_donor"("id") ON DELETE cascade ON UPDATE cascade;