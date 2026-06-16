CREATE TABLE "channel_live_stream" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"mux_live_stream_id" text NOT NULL,
	"mux_playback_id" text,
	"latency_mode" text DEFAULT 'standard' NOT NULL,
	"reconnect_window" integer DEFAULT 60 NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"next_title" text,
	"next_description" text,
	"next_visibility" "upload_visibility",
	"next_license" "upload_license",
	"next_comments_enabled" boolean,
	"next_downloads_enabled" boolean,
	"next_series_id" uuid,
	"created_by_id" uuid,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL,
	CONSTRAINT "channel_live_stream_channel_id_unique" UNIQUE("channel_id"),
	CONSTRAINT "channel_live_stream_mux_live_stream_id_unique" UNIQUE("mux_live_stream_id")
);
--> statement-breakpoint
CREATE TABLE "channel_simulcast_target" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_live_stream_id" uuid NOT NULL,
	"mux_simulcast_target_id" text NOT NULL,
	"label" text,
	"url" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "upload_record" ADD COLUMN "is_live_broadcast" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "upload_record" ADD COLUMN "mux_asset_id" text;--> statement-breakpoint
ALTER TABLE "upload_record" ADD COLUMN "mux_playback_id" text;--> statement-breakpoint
ALTER TABLE "upload_record" ADD COLUMN "live_started_at" timestamp (3);--> statement-breakpoint
ALTER TABLE "upload_record" ADD COLUMN "live_ended_at" timestamp (3);--> statement-breakpoint
ALTER TABLE "channel_live_stream" ADD CONSTRAINT "channel_live_stream_channel_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "channel_live_stream" ADD CONSTRAINT "channel_live_stream_createdBy_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "channel_simulcast_target" ADD CONSTRAINT "channel_simulcast_target_liveStream_fkey" FOREIGN KEY ("channel_live_stream_id") REFERENCES "public"."channel_live_stream"("id") ON DELETE cascade ON UPDATE cascade;