CREATE TABLE "site_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"maintenance_mode" boolean DEFAULT false NOT NULL,
	"maintenance_message" text,
	"updated_by_id" uuid,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "site_config_singleton" CHECK ("site_config"."id" = 1)
);
