CREATE TABLE "donation_admin_digest" (
	"donation_id" uuid PRIMARY KEY NOT NULL,
	"queued_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "donation_admin_digest" ADD CONSTRAINT "donation_admin_digest_donation_fkey" FOREIGN KEY ("donation_id") REFERENCES "public"."donation"("id") ON DELETE cascade ON UPDATE cascade;