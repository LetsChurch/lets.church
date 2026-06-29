CREATE TABLE "speaker" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"bio" text,
	"avatar_path" text,
	"avatar_blurhash" text,
	"created_by_id" uuid,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL,
	"deleted_at" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "speaker_attribution" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"upload_record_id" uuid NOT NULL,
	"speaker_label" text NOT NULL,
	"speaker_id" uuid NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "speaker_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"speaker_id" uuid NOT NULL,
	"requesting_channel_id" uuid NOT NULL,
	"status" "invitation_status" DEFAULT 'PENDING' NOT NULL,
	"requested_for_upload_id" uuid,
	"granted_upload_id" uuid,
	"requested_by_id" uuid,
	"responded_by_id" uuid,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"responded_at" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "speaker_paragraph_label" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"paragraph_id" uuid NOT NULL,
	"label" text NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "speaker_tag_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"speaker_id" uuid NOT NULL,
	"upload_record_id" uuid NOT NULL,
	"speaker_label" text NOT NULL,
	"status" "invitation_status" DEFAULT 'PENDING' NOT NULL,
	"requested_by_id" uuid,
	"responded_by_id" uuid,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"responded_at" timestamp (3)
);
--> statement-breakpoint
ALTER TABLE "speaker" ADD CONSTRAINT "speaker_channel_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "speaker" ADD CONSTRAINT "speaker_createdBy_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "speaker_attribution" ADD CONSTRAINT "speaker_attribution_uploadRecord_fkey" FOREIGN KEY ("upload_record_id") REFERENCES "public"."upload_record"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "speaker_attribution" ADD CONSTRAINT "speaker_attribution_speaker_fkey" FOREIGN KEY ("speaker_id") REFERENCES "public"."speaker"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "speaker_attribution" ADD CONSTRAINT "speaker_attribution_createdBy_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "speaker_link" ADD CONSTRAINT "speaker_link_speaker_fkey" FOREIGN KEY ("speaker_id") REFERENCES "public"."speaker"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "speaker_link" ADD CONSTRAINT "speaker_link_requestingChannel_fkey" FOREIGN KEY ("requesting_channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "speaker_link" ADD CONSTRAINT "speaker_link_requestedForUpload_fkey" FOREIGN KEY ("requested_for_upload_id") REFERENCES "public"."upload_record"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "speaker_link" ADD CONSTRAINT "speaker_link_grantedUpload_fkey" FOREIGN KEY ("granted_upload_id") REFERENCES "public"."upload_record"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "speaker_link" ADD CONSTRAINT "speaker_link_requestedBy_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "speaker_link" ADD CONSTRAINT "speaker_link_respondedBy_fkey" FOREIGN KEY ("responded_by_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "speaker_paragraph_label" ADD CONSTRAINT "speaker_paragraph_label_paragraph_fkey" FOREIGN KEY ("paragraph_id") REFERENCES "public"."transcript_paragraph"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "speaker_paragraph_label" ADD CONSTRAINT "speaker_paragraph_label_createdBy_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "speaker_tag_request" ADD CONSTRAINT "speaker_tag_request_speaker_fkey" FOREIGN KEY ("speaker_id") REFERENCES "public"."speaker"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "speaker_tag_request" ADD CONSTRAINT "speaker_tag_request_uploadRecord_fkey" FOREIGN KEY ("upload_record_id") REFERENCES "public"."upload_record"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "speaker_tag_request" ADD CONSTRAINT "speaker_tag_request_requestedBy_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "speaker_tag_request" ADD CONSTRAINT "speaker_tag_request_respondedBy_fkey" FOREIGN KEY ("responded_by_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "speaker_channel_id_slug_key" ON "speaker" USING btree ("channel_id","slug");--> statement-breakpoint
CREATE INDEX "speaker_channel_id_idx" ON "speaker" USING btree ("channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "speaker_attribution_upload_record_id_speaker_label_key" ON "speaker_attribution" USING btree ("upload_record_id","speaker_label");--> statement-breakpoint
CREATE INDEX "speaker_attribution_speaker_id_idx" ON "speaker_attribution" USING btree ("speaker_id");--> statement-breakpoint
CREATE UNIQUE INDEX "speaker_link_speaker_id_requesting_channel_id_key" ON "speaker_link" USING btree ("speaker_id","requesting_channel_id");--> statement-breakpoint
CREATE INDEX "speaker_link_requesting_channel_id_idx" ON "speaker_link" USING btree ("requesting_channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "speaker_paragraph_label_paragraph_id_key" ON "speaker_paragraph_label" USING btree ("paragraph_id");--> statement-breakpoint
CREATE UNIQUE INDEX "speaker_tag_request_speaker_upload_label_key" ON "speaker_tag_request" USING btree ("speaker_id","upload_record_id","speaker_label");--> statement-breakpoint
CREATE INDEX "speaker_tag_request_upload_record_id_idx" ON "speaker_tag_request" USING btree ("upload_record_id");