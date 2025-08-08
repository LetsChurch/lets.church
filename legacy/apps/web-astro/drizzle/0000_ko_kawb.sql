-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TYPE "public"."TagColor" AS ENUM('GRAY', 'RED', 'YELLOW', 'GREEN', 'BLUE', 'INDIGO', 'PURPLE', 'PINK');--> statement-breakpoint
CREATE TYPE "public"."address_type" AS ENUM('MAILING', 'MEETING', 'OFFICE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."app_user_role" AS ENUM('USER', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."channel_visibility" AS ENUM('PUBLIC', 'PRIVATE', 'UNLISTED');--> statement-breakpoint
CREATE TYPE "public"."organization_leader_type" AS ENUM('ELDER', 'DEACON', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."organization_tag_category" AS ENUM('DENOMINATION', 'DOCTRINE', 'ESCHATOLOGY', 'WORSHIP', 'CONFESSION', 'GOVERNMENT', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."organization_type" AS ENUM('CHURCH', 'MINISTRY');--> statement-breakpoint
CREATE TYPE "public"."rating" AS ENUM('LIKE', 'DISLIKE');--> statement-breakpoint
CREATE TYPE "public"."upload_license" AS ENUM('STANDARD', 'PUBLIC_DOMAIN', 'CC_BY', 'CC_BY_SA', 'CC_BY_NC', 'CC_BY_NC_SA', 'CC_BY_ND', 'CC_BY_NC_ND', 'CC0');--> statement-breakpoint
CREATE TYPE "public"."upload_list_type" AS ENUM('SERIES', 'PLAYLIST');--> statement-breakpoint
CREATE TYPE "public"."upload_variant" AS ENUM('VIDEO_4K', 'VIDEO_4K_DOWNLOAD', 'VIDEO_1080P', 'VIDEO_1080P_DOWNLOAD', 'VIDEO_720P', 'VIDEO_720P_DOWNLOAD', 'VIDEO_480P', 'VIDEO_480P_DOWNLOAD', 'VIDEO_360P', 'VIDEO_360P_DOWNLOAD', 'AUDIO', 'AUDIO_DOWNLOAD');--> statement-breakpoint
CREATE TYPE "public"."upload_visibility" AS ENUM('PUBLIC', 'PRIVATE', 'UNLISTED');--> statement-breakpoint
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tracking_salt" (
	"id" serial PRIMARY KEY NOT NULL,
	"salt" integer NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" "citext" NOT NULL,
	"password" text NOT NULL,
	"full_name" varchar(100),
	"avatar_path" varchar(255),
	"avatar_blurhash" varchar(255),
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"deleted_at" timestamp(3),
	"role" "app_user_role" DEFAULT 'USER' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_user_email" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_user_id" uuid NOT NULL,
	"email" "citext" NOT NULL,
	"key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"verified_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_user_id" uuid NOT NULL,
	"expires_at" timestamp(3) DEFAULT (now() + '30 days'::interval) NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"deleted_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "channel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"avatar_path" varchar(255),
	"avatar_blurhash" varchar(255),
	"slug" "citext" NOT NULL,
	"description" text,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"default_thumbnail_blurhash" varchar(255),
	"default_thumbnail_path" varchar(255),
	"visibility" "channel_visibility" DEFAULT 'PUBLIC' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "upload_record_download_size" (
	"upload_record_id" uuid NOT NULL,
	"variant" "upload_variant" NOT NULL,
	"size_bytes" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "upload_user_comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"author_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	"replying_to_id" uuid,
	"text" text NOT NULL,
	"score" double precision DEFAULT 0 NOT NULL,
	"score_stale_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "upload_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text,
	"description" text,
	"app_user_id" uuid NOT NULL,
	"license" "upload_license" NOT NULL,
	"channel_id" uuid NOT NULL,
	"visibility" "upload_visibility" NOT NULL,
	"upload_size_bytes" bigint,
	"upload_finalized" boolean DEFAULT false NOT NULL,
	"upload_finalized_by_id" uuid,
	"default_thumbnail_path" text,
	"length_seconds" double precision,
	"default_thumbnail_blurhash" text,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"published_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"transcoding_started_at" timestamp(3),
	"transcoding_finished_at" timestamp(3),
	"transcoding_progress" double precision DEFAULT 0 NOT NULL,
	"transcribing_started_at" timestamp(3),
	"transcribing_finished_at" timestamp(3),
	"deleted_at" timestamp(3),
	"variants" "upload_variant"[],
	"score" double precision DEFAULT 0 NOT NULL,
	"score_stale_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP,
	"user_comments_enabled" boolean DEFAULT true NOT NULL,
	"downloads_enabled" boolean DEFAULT true NOT NULL,
	"finalized_upload_key" text,
	"override_thumbnail_blurhash" text,
	"override_thumbnail_path" text,
	"thumbnail_count" integer,
	"upload_finalized_at" timestamp(3),
	"probe" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "upload_list" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"title" text NOT NULL,
	"author_id" uuid NOT NULL,
	"channel_id" uuid,
	"type" "upload_list_type" NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "upload_view_ranges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"upload_record_id" uuid NOT NULL,
	"viewer_hash" bigint NOT NULL,
	"app_user_id" uuid,
	"view_timestamp" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"ranges" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_time" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_address" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country" text,
	"geocoding_json" jsonb,
	"locality" text,
	"name" text,
	"organization_id" uuid NOT NULL,
	"post_office_box_number" text,
	"postal_code" text,
	"query" text,
	"region" text,
	"street_address" text,
	"type" "address_type" NOT NULL,
	"latitude" double precision,
	"longitude" double precision
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_tag" (
	"slug" "citext" NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"more_info_link" text,
	"category" "organization_tag_category" NOT NULL,
	"color" "TagColor" DEFAULT 'GRAY' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" "citext" NOT NULL,
	"description" text,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"type" "organization_type" DEFAULT 'MINISTRY' NOT NULL,
	"avatar_path" text,
	"cover_path" text,
	"primary_email" text,
	"primary_phone_number" text,
	"website_url" text,
	"automatically_approve_organization_associations" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_leader" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"type" "organization_leader_type" NOT NULL,
	"name" text,
	"email" text,
	"phone_number" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "channel_subscription" (
	"app_user_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	CONSTRAINT "channel_subscription_pkey" PRIMARY KEY("app_user_id","channel_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_tag_suggestion" (
	"parent_slug" "citext" NOT NULL,
	"recommended_slug" "citext" NOT NULL,
	CONSTRAINT "organization_tag_suggestion_pkey" PRIMARY KEY("parent_slug","recommended_slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_tag_instance" (
	"organization_id" uuid NOT NULL,
	"tag_slug" "citext" NOT NULL,
	CONSTRAINT "organization_tag_instance_pkey" PRIMARY KEY("organization_id","tag_slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "upload_list_entry" (
	"upload_list_id" uuid NOT NULL,
	"upload_record_id" uuid NOT NULL,
	"rank" varchar(12) NOT NULL,
	CONSTRAINT "upload_list_entry_pkey" PRIMARY KEY("upload_list_id","rank")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "upload_user_rating" (
	"app_user_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	"rating" "rating" NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "upload_user_rating_pkey" PRIMARY KEY("app_user_id","upload_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "upload_user_comment_rating" (
	"app_user_id" uuid NOT NULL,
	"upload_user_comment_id" uuid NOT NULL,
	"rating" "rating" NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "upload_user_comment_rating_pkey" PRIMARY KEY("app_user_id","upload_user_comment_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "upload_view" (
	"upload_record_id" uuid NOT NULL,
	"view_hash" bigint NOT NULL,
	"app_user_id" uuid,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "upload_view_pkey" PRIMARY KEY("upload_record_id","view_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_channel_association" (
	"organization_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	"official_channel" boolean DEFAULT false NOT NULL,
	CONSTRAINT "organization_channel_association_pkey" PRIMARY KEY("organization_id","channel_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_membership" (
	"organization_id" uuid NOT NULL,
	"app_user_id" uuid NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"can_edit" boolean DEFAULT false NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	CONSTRAINT "organization_membership_pkey" PRIMARY KEY("organization_id","app_user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_organization_association" (
	"upstream_organization_id" uuid NOT NULL,
	"downstream_organization_id" uuid NOT NULL,
	"upstream_approved" boolean DEFAULT false NOT NULL,
	"downstream_approved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	CONSTRAINT "organization_organization_association_pkey" PRIMARY KEY("upstream_organization_id","downstream_organization_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "channel_membership" (
	"channel_id" uuid NOT NULL,
	"app_user_id" uuid NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"can_edit" boolean DEFAULT false NOT NULL,
	"can_upload" boolean DEFAULT false NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	CONSTRAINT "channel_membership_pkey" PRIMARY KEY("channel_id","app_user_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_user_email" ADD CONSTRAINT "app_user_email_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_session" ADD CONSTRAINT "app_session_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "upload_record_download_size" ADD CONSTRAINT "upload_record_download_size_upload_record_id_fkey" FOREIGN KEY ("upload_record_id") REFERENCES "public"."upload_record"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "upload_user_comment" ADD CONSTRAINT "upload_user_comment_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "upload_user_comment" ADD CONSTRAINT "upload_user_comment_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "public"."upload_record"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "upload_user_comment" ADD CONSTRAINT "upload_user_comment_replying_to_id_fkey" FOREIGN KEY ("replying_to_id") REFERENCES "public"."upload_user_comment"("id") ON DELETE set null ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "upload_record" ADD CONSTRAINT "upload_record_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_user"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "upload_record" ADD CONSTRAINT "upload_record_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "upload_record" ADD CONSTRAINT "upload_record_upload_finalized_by_id_fkey" FOREIGN KEY ("upload_finalized_by_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "upload_list" ADD CONSTRAINT "upload_list_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "upload_list" ADD CONSTRAINT "upload_list_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE set null ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "upload_view_ranges" ADD CONSTRAINT "upload_view_ranges_upload_record_id_fkey" FOREIGN KEY ("upload_record_id") REFERENCES "public"."upload_record"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "upload_view_ranges" ADD CONSTRAINT "upload_view_ranges_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organization_address" ADD CONSTRAINT "organization_address_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organization_leader" ADD CONSTRAINT "organization_leader_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "channel_subscription" ADD CONSTRAINT "channel_subscription_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "channel_subscription" ADD CONSTRAINT "channel_subscription_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organization_tag_suggestion" ADD CONSTRAINT "organization_tag_suggestion_parent_slug_fkey" FOREIGN KEY ("parent_slug") REFERENCES "public"."organization_tag"("slug") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organization_tag_suggestion" ADD CONSTRAINT "organization_tag_suggestion_recommended_slug_fkey" FOREIGN KEY ("recommended_slug") REFERENCES "public"."organization_tag"("slug") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organization_tag_instance" ADD CONSTRAINT "organization_tag_instance_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organization_tag_instance" ADD CONSTRAINT "organization_tag_instance_tag_slug_fkey" FOREIGN KEY ("tag_slug") REFERENCES "public"."organization_tag"("slug") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "upload_list_entry" ADD CONSTRAINT "upload_list_entry_upload_list_id_fkey" FOREIGN KEY ("upload_list_id") REFERENCES "public"."upload_list"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "upload_list_entry" ADD CONSTRAINT "upload_list_entry_upload_record_id_fkey" FOREIGN KEY ("upload_record_id") REFERENCES "public"."upload_record"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "upload_user_rating" ADD CONSTRAINT "upload_user_rating_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "upload_user_rating" ADD CONSTRAINT "upload_user_rating_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "public"."upload_record"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "upload_user_comment_rating" ADD CONSTRAINT "upload_user_comment_rating_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "upload_user_comment_rating" ADD CONSTRAINT "upload_user_comment_rating_upload_user_comment_id_fkey" FOREIGN KEY ("upload_user_comment_id") REFERENCES "public"."upload_user_comment"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "upload_view" ADD CONSTRAINT "upload_view_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "upload_view" ADD CONSTRAINT "upload_view_upload_record_id_fkey" FOREIGN KEY ("upload_record_id") REFERENCES "public"."upload_record"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organization_channel_association" ADD CONSTRAINT "organization_channel_association_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organization_channel_association" ADD CONSTRAINT "organization_channel_association_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organization_membership" ADD CONSTRAINT "organization_membership_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organization_membership" ADD CONSTRAINT "organization_membership_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organization_organization_association" ADD CONSTRAINT "organization_organization_association_upstream_organizatio_fkey" FOREIGN KEY ("upstream_organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organization_organization_association" ADD CONSTRAINT "organization_organization_association_downstream_organizat_fkey" FOREIGN KEY ("downstream_organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "channel_membership" ADD CONSTRAINT "channel_membership_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "channel_membership" ADD CONSTRAINT "channel_membership_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "app_user_username_key" ON "app_user" USING btree ("username" citext_ops);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "app_user_email_email_key" ON "app_user_email" USING btree ("email" citext_ops);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "channel_slug_key" ON "channel" USING btree ("slug" citext_ops);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "upload_record_download_size_upload_record_id_variant_key" ON "upload_record_download_size" USING btree ("upload_record_id" uuid_ops,"variant" uuid_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_user_comment_replying_to_id_idx" ON "upload_user_comment" USING btree ("replying_to_id" uuid_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_user_comment_score_idx" ON "upload_user_comment" USING btree ("score" float8_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_user_comment_score_stale_at_idx" ON "upload_user_comment" USING btree ("score_stale_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_record_created_at_id_idx" ON "upload_record" USING btree ("created_at" uuid_ops,"id" timestamp_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_record_score_idx" ON "upload_record" USING btree ("score" float8_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_record_score_stale_at_idx" ON "upload_record" USING btree ("score_stale_at" timestamp_ops);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "upload_list_created_at_id_key" ON "upload_list" USING btree ("created_at" timestamp_ops,"id" timestamp_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_view_ranges_upload_record_id_viewer_hash_idx" ON "upload_view_ranges" USING btree ("upload_record_id" int8_ops,"viewer_hash" int8_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_view_ranges_view_timestamp_idx" ON "upload_view_ranges" USING btree ("view_timestamp" timestamp_ops);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organization_slug_key" ON "organization" USING btree ("slug" citext_ops);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "upload_list_entry_upload_list_id_upload_record_id_key" ON "upload_list_entry" USING btree ("upload_list_id" uuid_ops,"upload_record_id" uuid_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_user_rating_app_user_id_rating_idx" ON "upload_user_rating" USING btree ("app_user_id" uuid_ops,"rating" enum_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_user_rating_upload_id_rating_idx" ON "upload_user_rating" USING btree ("upload_id" enum_ops,"rating" enum_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_user_comment_rating_app_user_id_rating_idx" ON "upload_user_comment_rating" USING btree ("app_user_id" uuid_ops,"rating" enum_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_user_comment_rating_upload_user_comment_id_rating_idx" ON "upload_user_comment_rating" USING btree ("upload_user_comment_id" enum_ops,"rating" enum_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_view_app_user_id_upload_record_id_idx" ON "upload_view" USING btree ("app_user_id" uuid_ops,"upload_record_id" uuid_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_view_created_at_idx" ON "upload_view" USING btree ("created_at" timestamp_ops);
*/
