CREATE TABLE "organization_channel_link_suggestion" (
	"organization_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"notified_at" timestamp (3),
	"dismissed_at" timestamp (3),
	"dismissed_by_id" uuid,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "OrganizationChannelLinkSuggestion_cpk" PRIMARY KEY("organization_id","channel_id")
);
--> statement-breakpoint
ALTER TABLE "organization_channel_link_suggestion" ADD CONSTRAINT "organization_channel_link_suggestion_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "organization_channel_link_suggestion" ADD CONSTRAINT "organization_channel_link_suggestion_channel_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "organization_channel_link_suggestion" ADD CONSTRAINT "organization_channel_link_suggestion_dismissed_by_fkey" FOREIGN KEY ("dismissed_by_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE cascade;