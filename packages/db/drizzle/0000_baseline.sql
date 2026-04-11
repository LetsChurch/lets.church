CREATE TYPE "public"."address_type" AS ENUM('MAILING', 'MEETING', 'OFFICE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."app_user_role" AS ENUM('USER', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."backup_status" AS ENUM('NOT_BACKED_UP', 'BACKING_UP', 'BACKED_UP', 'BACKUP_FAILED');--> statement-breakpoint
CREATE TYPE "public"."channel_import_run_status" AS ENUM('IN_PROGRESS', 'COMPLETED', 'FAILED', 'PARTIAL');--> statement-breakpoint
CREATE TYPE "public"."channel_import_source_workflow_status" AS ENUM('NOT_STARTED', 'RUNNING', 'PAUSED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."channel_visibility" AS ENUM('PUBLIC', 'PRIVATE', 'UNLISTED');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."newsletter_list_optin" AS ENUM('single', 'double');--> statement-breakpoint
CREATE TYPE "public"."newsletter_list_type" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TYPE "public"."organization_leader_type" AS ENUM('ELDER', 'DEACON', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."organization_tag_category" AS ENUM('DENOMINATION', 'DOCTRINE', 'ESCHATOLOGY', 'WORSHIP', 'CONFESSION', 'GOVERNMENT', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."organization_type" AS ENUM('CHURCH', 'MINISTRY');--> statement-breakpoint
CREATE TYPE "public"."rating" AS ENUM('LIKE', 'DISLIKE');--> statement-breakpoint
CREATE TYPE "public"."TagColor" AS ENUM('GRAY', 'RED', 'YELLOW', 'GREEN', 'BLUE', 'INDIGO', 'PURPLE', 'PINK');--> statement-breakpoint
CREATE TYPE "public"."upload_license" AS ENUM('STANDARD', 'PUBLIC_DOMAIN', 'CC_BY', 'CC_BY_SA', 'CC_BY_NC', 'CC_BY_NC_SA', 'CC_BY_ND', 'CC_BY_NC_ND', 'CC0');--> statement-breakpoint
CREATE TYPE "public"."upload_list_type" AS ENUM('SERIES', 'PLAYLIST');--> statement-breakpoint
CREATE TYPE "public"."upload_state_type" AS ENUM('MEDIA', 'THUMBNAIL', 'PROFILE_AVATAR', 'CHANNEL_AVATAR', 'CHANNEL_COVER', 'ORGANIZATION_AVATAR', 'ORGANIZATION_COVER', 'CHANNEL_DEFAULT_THUMBNAIL');--> statement-breakpoint
CREATE TYPE "public"."upload_variant" AS ENUM('VIDEO_4K', 'VIDEO_4K_DOWNLOAD', 'VIDEO_1080P', 'VIDEO_1080P_DOWNLOAD', 'VIDEO_720P', 'VIDEO_720P_DOWNLOAD', 'VIDEO_480P', 'VIDEO_480P_DOWNLOAD', 'VIDEO_360P', 'VIDEO_360P_DOWNLOAD', 'AUDIO', 'AUDIO_DOWNLOAD');--> statement-breakpoint
CREATE TYPE "public"."upload_view_source" AS ENUM('WEBSITE', 'EMBED');--> statement-breakpoint
CREATE TYPE "public"."upload_visibility" AS ENUM('PUBLIC', 'PRIVATE', 'UNLISTED');--> statement-breakpoint
CREATE TABLE "app_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_user_id" uuid NOT NULL,
	"expires_at" timestamp (3) DEFAULT (now() + '30 days'::interval) NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL,
	"deleted_at" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"full_name" text,
	"avatar_path" text,
	"avatar_blurhash" text,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL,
	"deleted_at" timestamp (3),
	"role" "app_user_role" DEFAULT 'USER' NOT NULL,
	CONSTRAINT "app_user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "app_user_email" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"verified_at" timestamp (3),
	CONSTRAINT "app_user_email_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "channel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"visibility" "channel_visibility" DEFAULT 'PUBLIC' NOT NULL,
	"avatar_path" text,
	"avatar_blurhash" text,
	"cover_path" text,
	"cover_blurhash" text,
	"slug" text NOT NULL,
	"description" text,
	"website_url" text,
	"facebook_url" text,
	"instagram_url" text,
	"x_url" text,
	"youtube_url" text,
	"tiktok_url" text,
	"linkedin_url" text,
	"threads_url" text,
	"apple_podcasts_url" text,
	"spotify_url" text,
	"rss_url" text,
	"approved_by_id" uuid,
	"approved_at" timestamp (3),
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL,
	"deleted_at" timestamp (3),
	"default_thumbnail_path" text,
	"default_thumbnail_blurhash" text,
	"default_upload_visibility" "upload_visibility",
	"default_upload_license" "upload_license",
	"default_upload_comments_enabled" boolean,
	"default_upload_downloads_enabled" boolean,
	CONSTRAINT "channel_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "channel_import_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_source_id" uuid NOT NULL,
	"started_at" timestamp (3) DEFAULT now() NOT NULL,
	"completed_at" timestamp (3),
	"status" "channel_import_run_status" NOT NULL,
	"items_found" integer NOT NULL,
	"items_imported" integer NOT NULL,
	"items_skipped" integer NOT NULL,
	"items_failed" integer NOT NULL,
	"error_message" text,
	"error_details" jsonb
);
--> statement-breakpoint
CREATE TABLE "channel_import_source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"url" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"cron_schedule" text DEFAULT '0 1 * * *' NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"last_imported_at" timestamp (3),
	"last_successful_import_at" timestamp (3),
	"last_error_at" timestamp (3),
	"last_error_message" text,
	"earliest_import_date" timestamp (3),
	"last_imported_upload_date" timestamp (3),
	"deduplication_enabled" boolean NOT NULL,
	"deduplication_fields" jsonb,
	"workflow_id" text,
	"workflow_status" "channel_import_source_workflow_status" DEFAULT 'NOT_STARTED' NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"created_by_id" uuid NOT NULL,
	"updated_at" timestamp (3) NOT NULL,
	"updated_by_id" uuid
);
--> statement-breakpoint
CREATE TABLE "channel_invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"email" text NOT NULL,
	"token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"status" "invitation_status" DEFAULT 'PENDING' NOT NULL,
	"is_admin" boolean NOT NULL,
	"can_edit" boolean NOT NULL,
	"can_upload" boolean DEFAULT true NOT NULL,
	"can_download" boolean NOT NULL,
	"invited_by_id" uuid NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"expires_at" timestamp (3) NOT NULL,
	"responded_at" timestamp (3),
	CONSTRAINT "channel_invitation_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "channel_membership" (
	"channel_id" uuid NOT NULL,
	"app_user_id" uuid NOT NULL,
	"is_admin" boolean NOT NULL,
	"can_edit" boolean NOT NULL,
	"can_upload" boolean DEFAULT true NOT NULL,
	"can_download" boolean NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL,
	CONSTRAINT "ChannelMembership_cpk" PRIMARY KEY("channel_id","app_user_id")
);
--> statement-breakpoint
CREATE TABLE "channel_subscription" (
	"app_user_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	CONSTRAINT "ChannelSubscription_cpk" PRIMARY KEY("app_user_id","channel_id")
);
--> statement-breakpoint
CREATE TABLE "featured_upload" (
	"upload_record_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL,
	CONSTRAINT "FeaturedUpload_cpk" PRIMARY KEY("upload_record_id")
);
--> statement-breakpoint
CREATE TABLE "import_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_source_id" uuid NOT NULL,
	"upload_record_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"url" text,
	"published_at" timestamp (3) NOT NULL,
	"source" text,
	"created_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_mailing_list" (
	"listmonk_uuid" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "newsletter_list_type" DEFAULT 'public' NOT NULL,
	"optin" "newsletter_list_optin" DEFAULT 'single' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"subscribe_on_registration" boolean NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "organization_type" DEFAULT 'MINISTRY' NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"avatar_path" text,
	"cover_path" text,
	"primary_email" text,
	"primary_phone_number" text,
	"website_url" text,
	"facebook_url" text,
	"instagram_url" text,
	"x_url" text,
	"youtube_url" text,
	"tiktok_url" text,
	"linkedin_url" text,
	"threads_url" text,
	"apple_podcasts_url" text,
	"spotify_url" text,
	"rss_url" text,
	"description" text,
	"automatically_approve_organization_associations" boolean NOT NULL,
	"approved_by_id" uuid,
	"approved_at" timestamp (3),
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "organization_address" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"type" "address_type" NOT NULL,
	"name" text,
	"query" text,
	"geocoding_json" jsonb,
	"country" text,
	"locality" text,
	"region" text,
	"post_office_box_number" text,
	"postal_code" text,
	"street_address" text,
	"latitude" double precision,
	"longitude" double precision
);
--> statement-breakpoint
CREATE TABLE "organization_channel_association" (
	"organization_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"official_channel" boolean NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL,
	CONSTRAINT "OrganizationChannelAssociation_cpk" PRIMARY KEY("organization_id","channel_id")
);
--> statement-breakpoint
CREATE TABLE "organization_invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"status" "invitation_status" DEFAULT 'PENDING' NOT NULL,
	"is_admin" boolean NOT NULL,
	"can_edit" boolean NOT NULL,
	"invited_by_id" uuid NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"expires_at" timestamp (3) NOT NULL,
	"responded_at" timestamp (3),
	CONSTRAINT "organization_invitation_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "organization_leader" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"type" "organization_leader_type" NOT NULL,
	"name" text,
	"email" text,
	"phone_number" text
);
--> statement-breakpoint
CREATE TABLE "organization_membership" (
	"organization_id" uuid NOT NULL,
	"app_user_id" uuid NOT NULL,
	"is_admin" boolean NOT NULL,
	"can_edit" boolean NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL,
	CONSTRAINT "OrganizationMembership_cpk" PRIMARY KEY("organization_id","app_user_id")
);
--> statement-breakpoint
CREATE TABLE "organization_organization_association" (
	"upstream_organization_id" uuid NOT NULL,
	"downstream_organization_id" uuid NOT NULL,
	"upstream_approved" boolean NOT NULL,
	"downstream_approved" boolean NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL,
	CONSTRAINT "OrganizationOrganizationAssociation_cpk" PRIMARY KEY("upstream_organization_id","downstream_organization_id")
);
--> statement-breakpoint
CREATE TABLE "organization_tag" (
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"more_info_link" text,
	"category" "organization_tag_category" NOT NULL,
	"color" "TagColor" DEFAULT 'GRAY' NOT NULL,
	CONSTRAINT "organization_tag_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "organization_tag_instance" (
	"organization_id" uuid NOT NULL,
	"tag_slug" text NOT NULL,
	CONSTRAINT "OrganizationTagInstance_cpk" PRIMARY KEY("organization_id","tag_slug")
);
--> statement-breakpoint
CREATE TABLE "organization_tag_suggestion" (
	"parent_slug" text NOT NULL,
	"recommended_slug" text NOT NULL,
	CONSTRAINT "OrganizationTagSuggestion_cpk" PRIMARY KEY("parent_slug","recommended_slug")
);
--> statement-breakpoint
CREATE TABLE "saved_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_user_id" uuid NOT NULL,
	"upload_record_id" uuid NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_log_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query" text NOT NULL,
	"params" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"app_user_id" uuid,
	"user_deleted_at" timestamp (3),
	"media_count" integer NOT NULL,
	"transcript_count" integer NOT NULL,
	"channel_count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracking_salt" (
	"id" serial PRIMARY KEY NOT NULL,
	"salt" integer NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upload_list" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL,
	"title" text NOT NULL,
	"author_id" uuid NOT NULL,
	"channel_id" uuid,
	"type" "upload_list_type" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upload_list_entry" (
	"upload_list_id" uuid NOT NULL,
	"upload_record_id" uuid NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"rank" integer,
	CONSTRAINT "UploadListEntry_cpk" PRIMARY KEY("upload_list_id","upload_record_id")
);
--> statement-breakpoint
CREATE TABLE "upload_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text,
	"description" text,
	"app_user_id" uuid NOT NULL,
	"license" "upload_license" NOT NULL,
	"channel_id" uuid NOT NULL,
	"visibility" "upload_visibility" NOT NULL,
	"upload_size_bytes" bigint,
	"upload_finalized" boolean NOT NULL,
	"upload_finalized_at" timestamp (3),
	"upload_finalized_by_id" uuid,
	"finalized_upload_key" text,
	"original_file_name" text,
	"probe" jsonb,
	"default_thumbnail_path" text,
	"default_thumbnail_blurhash" text,
	"override_thumbnail_path" text,
	"override_thumbnail_blurhash" text,
	"thumbnail_count" integer,
	"length_seconds" double precision,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL,
	"published_at" timestamp (3) DEFAULT now() NOT NULL,
	"transcoding_started_at" timestamp (3),
	"transcoding_finished_at" timestamp (3),
	"transcoding_progress" double precision NOT NULL,
	"transcribing_started_at" timestamp (3),
	"transcribing_finished_at" timestamp (3),
	"deleted_at" timestamp (3),
	"variants" "upload_variant"[] NOT NULL,
	"score" double precision NOT NULL,
	"score_stale_at" timestamp (3) DEFAULT now(),
	"user_comments_enabled" boolean DEFAULT true NOT NULL,
	"downloads_enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upload_record_download_size" (
	"upload_record_id" uuid NOT NULL,
	"variant" "upload_variant" NOT NULL,
	"size_bytes" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upload_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"s3_key" text NOT NULL,
	"s3_bucket" text NOT NULL,
	"upload_type" "upload_state_type" NOT NULL,
	"size_bytes" bigint,
	"upload_record_id" uuid,
	"app_user_id" uuid,
	"channel_id" uuid,
	"organization_id" uuid,
	"backup_status" "backup_status" DEFAULT 'NOT_BACKED_UP' NOT NULL,
	"backup_key" text,
	"backed_up_at" timestamp (3),
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL,
	CONSTRAINT "upload_state_s3_key_unique" UNIQUE("s3_key")
);
--> statement-breakpoint
CREATE TABLE "upload_user_comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL,
	"author_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	"replying_to_id" uuid,
	"text" text NOT NULL,
	"score" double precision NOT NULL,
	"score_stale_at" timestamp (3) DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "upload_user_comment_rating" (
	"app_user_id" uuid NOT NULL,
	"upload_user_comment_id" uuid NOT NULL,
	"rating" "rating" NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "UploadUserCommentRating_cpk" PRIMARY KEY("app_user_id","upload_user_comment_id")
);
--> statement-breakpoint
CREATE TABLE "upload_user_rating" (
	"app_user_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	"rating" "rating" NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "UploadUserRating_cpk" PRIMARY KEY("app_user_id","upload_id")
);
--> statement-breakpoint
CREATE TABLE "upload_view" (
	"upload_record_id" uuid NOT NULL,
	"view_hash" bigint NOT NULL,
	"app_user_id" uuid,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"source" "upload_view_source" DEFAULT 'WEBSITE',
	CONSTRAINT "UploadView_cpk" PRIMARY KEY("upload_record_id","view_hash")
);
--> statement-breakpoint
CREATE TABLE "upload_view_second" (
	"upload_record_id" uuid NOT NULL,
	"view_hash" bigint NOT NULL,
	"second" integer NOT NULL,
	CONSTRAINT "UploadViewSecond_cpk" PRIMARY KEY("upload_record_id","view_hash","second")
);
--> statement-breakpoint
ALTER TABLE "app_session" ADD CONSTRAINT "app_session_appUser_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "app_user_email" ADD CONSTRAINT "app_user_email_appUser_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "channel" ADD CONSTRAINT "channel_approvedBy_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "channel_import_run" ADD CONSTRAINT "channel_import_run_importSource_fkey" FOREIGN KEY ("import_source_id") REFERENCES "public"."channel_import_source"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "channel_import_source" ADD CONSTRAINT "channel_import_source_channel_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "channel_import_source" ADD CONSTRAINT "channel_import_source_createdBy_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "channel_import_source" ADD CONSTRAINT "channel_import_source_updatedBy_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "channel_invitation" ADD CONSTRAINT "channel_invitation_channel_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "channel_invitation" ADD CONSTRAINT "channel_invitation_invitedBy_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "channel_membership" ADD CONSTRAINT "channel_membership_channel_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "channel_membership" ADD CONSTRAINT "channel_membership_appUser_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "channel_subscription" ADD CONSTRAINT "channel_subscription_appUser_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "channel_subscription" ADD CONSTRAINT "channel_subscription_channel_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "featured_upload" ADD CONSTRAINT "featured_upload_uploadRecord_fkey" FOREIGN KEY ("upload_record_id") REFERENCES "public"."upload_record"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "import_history" ADD CONSTRAINT "import_history_importSource_fkey" FOREIGN KEY ("import_source_id") REFERENCES "public"."channel_import_source"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "import_history" ADD CONSTRAINT "import_history_uploadRecord_fkey" FOREIGN KEY ("upload_record_id") REFERENCES "public"."upload_record"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_approvedBy_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "organization_address" ADD CONSTRAINT "organization_address_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "organization_channel_association" ADD CONSTRAINT "organization_channel_association_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "organization_channel_association" ADD CONSTRAINT "organization_channel_association_channel_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "organization_invitation" ADD CONSTRAINT "organization_invitation_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "organization_invitation" ADD CONSTRAINT "organization_invitation_invitedBy_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "organization_leader" ADD CONSTRAINT "organization_leader_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "organization_membership" ADD CONSTRAINT "organization_membership_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "organization_membership" ADD CONSTRAINT "organization_membership_appUser_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "organization_organization_association" ADD CONSTRAINT "organization_organization_association_upstreamOrganization_fkey" FOREIGN KEY ("upstream_organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "organization_organization_association" ADD CONSTRAINT "organization_organization_association_downstreamOrganization_fkey" FOREIGN KEY ("downstream_organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "organization_tag_instance" ADD CONSTRAINT "organization_tag_instance_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "organization_tag_instance" ADD CONSTRAINT "organization_tag_instance_tag_fkey" FOREIGN KEY ("tag_slug") REFERENCES "public"."organization_tag"("slug") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "organization_tag_suggestion" ADD CONSTRAINT "organization_tag_suggestion_parent_fkey" FOREIGN KEY ("parent_slug") REFERENCES "public"."organization_tag"("slug") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "organization_tag_suggestion" ADD CONSTRAINT "organization_tag_suggestion_suggested_fkey" FOREIGN KEY ("recommended_slug") REFERENCES "public"."organization_tag"("slug") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "saved_media" ADD CONSTRAINT "saved_media_appUser_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "saved_media" ADD CONSTRAINT "saved_media_uploadRecord_fkey" FOREIGN KEY ("upload_record_id") REFERENCES "public"."upload_record"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "search_log_entry" ADD CONSTRAINT "search_log_entry_appUser_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "upload_list" ADD CONSTRAINT "upload_list_author_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "upload_list" ADD CONSTRAINT "upload_list_channel_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "upload_list_entry" ADD CONSTRAINT "upload_list_entry_uploadList_fkey" FOREIGN KEY ("upload_list_id") REFERENCES "public"."upload_list"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "upload_list_entry" ADD CONSTRAINT "upload_list_entry_upload_fkey" FOREIGN KEY ("upload_record_id") REFERENCES "public"."upload_record"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "upload_record" ADD CONSTRAINT "upload_record_createdBy_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "upload_record" ADD CONSTRAINT "upload_record_channel_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "upload_record" ADD CONSTRAINT "upload_record_uploadFinalizedBy_fkey" FOREIGN KEY ("upload_finalized_by_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "upload_record_download_size" ADD CONSTRAINT "upload_record_download_size_uploadRecord_fkey" FOREIGN KEY ("upload_record_id") REFERENCES "public"."upload_record"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "upload_state" ADD CONSTRAINT "upload_state_uploadRecord_fkey" FOREIGN KEY ("upload_record_id") REFERENCES "public"."upload_record"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "upload_state" ADD CONSTRAINT "upload_state_appUser_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "upload_state" ADD CONSTRAINT "upload_state_channel_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "upload_state" ADD CONSTRAINT "upload_state_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "upload_user_comment" ADD CONSTRAINT "upload_user_comment_author_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "upload_user_comment" ADD CONSTRAINT "upload_user_comment_upload_fkey" FOREIGN KEY ("upload_id") REFERENCES "public"."upload_record"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "upload_user_comment" ADD CONSTRAINT "upload_user_comment_replyingTo_fkey" FOREIGN KEY ("replying_to_id") REFERENCES "public"."upload_user_comment"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "upload_user_comment_rating" ADD CONSTRAINT "upload_user_comment_rating_appUser_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "upload_user_comment_rating" ADD CONSTRAINT "upload_user_comment_rating_uploadUserComment_fkey" FOREIGN KEY ("upload_user_comment_id") REFERENCES "public"."upload_user_comment"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "upload_user_rating" ADD CONSTRAINT "upload_user_rating_appUser_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "upload_user_rating" ADD CONSTRAINT "upload_user_rating_uploadRecord_fkey" FOREIGN KEY ("upload_id") REFERENCES "public"."upload_record"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "upload_view" ADD CONSTRAINT "upload_view_upload_fkey" FOREIGN KEY ("upload_record_id") REFERENCES "public"."upload_record"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "upload_view" ADD CONSTRAINT "upload_view_user_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "upload_view_second" ADD CONSTRAINT "upload_view_second_view_fkey" FOREIGN KEY ("upload_record_id","view_hash") REFERENCES "public"."upload_view"("upload_record_id","view_hash") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "ChannelInvitation_channelId_email_key" ON "channel_invitation" USING btree ("channel_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "OrganizationInvitation_organizationId_email_key" ON "organization_invitation" USING btree ("organization_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "SavedMedia_appUserId_uploadRecordId_key" ON "saved_media" USING btree ("app_user_id","upload_record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "UploadList_createdAt_id_key" ON "upload_list" USING btree ("created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "UploadRecordDownloadSize_uploadRecordId_variant_key" ON "upload_record_download_size" USING btree ("upload_record_id","variant");
