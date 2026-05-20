ALTER TABLE "organization_tag_instance" DROP CONSTRAINT "organization_tag_instance_tag_fkey";--> statement-breakpoint
ALTER TABLE "organization_tag_suggestion" DROP CONSTRAINT "organization_tag_suggestion_parent_fkey";--> statement-breakpoint
ALTER TABLE "organization_tag_suggestion" DROP CONSTRAINT "organization_tag_suggestion_suggested_fkey";--> statement-breakpoint
ALTER TABLE "organization_tag" DROP CONSTRAINT "organization_tag_slug_unique";--> statement-breakpoint
ALTER TABLE "channel_import_source" DROP CONSTRAINT "channel_import_source_createdBy_fkey";
--> statement-breakpoint
ALTER TABLE "channel_import_source" DROP CONSTRAINT "channel_import_source_updatedBy_fkey";
--> statement-breakpoint
ALTER TABLE "channel_invitation" DROP CONSTRAINT "channel_invitation_invitedBy_fkey";
--> statement-breakpoint
ALTER TABLE "organization_invitation" DROP CONSTRAINT "organization_invitation_invitedBy_fkey";
--> statement-breakpoint
DROP INDEX "UploadRecordDownloadSize_uploadRecordId_variant_key";--> statement-breakpoint
ALTER TABLE "channel_import_source" ALTER COLUMN "created_by_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "channel_invitation" ALTER COLUMN "invited_by_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_invitation" ALTER COLUMN "invited_by_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_tag" ADD PRIMARY KEY ("slug");--> statement-breakpoint
ALTER TABLE "upload_record" ALTER COLUMN "pipeline_version" SET DEFAULT 2;--> statement-breakpoint
ALTER TABLE "upload_record_download_size" ADD CONSTRAINT "UploadRecordDownloadSize_cpk" PRIMARY KEY("upload_record_id","variant");--> statement-breakpoint
ALTER TABLE "channel_import_source" ADD CONSTRAINT "channel_import_source_createdBy_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "channel_import_source" ADD CONSTRAINT "channel_import_source_updatedBy_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "channel_invitation" ADD CONSTRAINT "channel_invitation_invitedBy_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "organization_invitation" ADD CONSTRAINT "organization_invitation_invitedBy_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "organization_tag_instance" ADD CONSTRAINT "organization_tag_instance_tag_fkey" FOREIGN KEY ("tag_slug") REFERENCES "public"."organization_tag"("slug") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "organization_tag_suggestion" ADD CONSTRAINT "organization_tag_suggestion_parent_fkey" FOREIGN KEY ("parent_slug") REFERENCES "public"."organization_tag"("slug") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "organization_tag_suggestion" ADD CONSTRAINT "organization_tag_suggestion_suggested_fkey" FOREIGN KEY ("recommended_slug") REFERENCES "public"."organization_tag"("slug") ON DELETE cascade ON UPDATE cascade;
