-- Fix FK constraints that were left as ON DELETE RESTRICT from Prisma-era migrations.
-- Each block: drop old Prisma name (IF EXISTS), drop drizzle name if somehow present,
-- then add the drizzle-named CASCADE constraint.

-- upload_view_second → upload_view (blocked deleteUploadWorkflow)
ALTER TABLE "upload_view_second" DROP CONSTRAINT IF EXISTS "upload_view_second_upload_record_id_view_hash_fkey";
--> statement-breakpoint
ALTER TABLE "upload_view_second" DROP CONSTRAINT IF EXISTS "upload_view_second_view_fkey";
--> statement-breakpoint
ALTER TABLE "upload_view_second" ADD CONSTRAINT "upload_view_second_view_fkey" FOREIGN KEY ("upload_record_id","view_hash") REFERENCES "public"."upload_view"("upload_record_id","view_hash") ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint

-- upload_record → channel (blocked deleteChannelWorkflow)
ALTER TABLE "upload_record" DROP CONSTRAINT IF EXISTS "upload_record_channel_id_fkey";
--> statement-breakpoint
ALTER TABLE "upload_record" DROP CONSTRAINT IF EXISTS "upload_record_channel_fkey";
--> statement-breakpoint
ALTER TABLE "upload_record" ADD CONSTRAINT "upload_record_channel_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint

-- upload_record → app_user (blocks user deletion)
ALTER TABLE "upload_record" DROP CONSTRAINT IF EXISTS "upload_record_app_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "upload_record" DROP CONSTRAINT IF EXISTS "upload_record_createdBy_fkey";
--> statement-breakpoint
ALTER TABLE "upload_record" ADD CONSTRAINT "upload_record_createdBy_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint

-- upload_list_entry → upload_list (blocks list deletion)
ALTER TABLE "upload_list_entry" DROP CONSTRAINT IF EXISTS "upload_list_entry_upload_list_id_fkey";
--> statement-breakpoint
ALTER TABLE "upload_list_entry" DROP CONSTRAINT IF EXISTS "upload_list_entry_uploadList_fkey";
--> statement-breakpoint
ALTER TABLE "upload_list_entry" ADD CONSTRAINT "upload_list_entry_uploadList_fkey" FOREIGN KEY ("upload_list_id") REFERENCES "public"."upload_list"("id") ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint

-- channel_import_source → app_user (blocks user deletion)
ALTER TABLE "channel_import_source" DROP CONSTRAINT IF EXISTS "channel_import_source_created_by_id_fkey";
--> statement-breakpoint
ALTER TABLE "channel_import_source" DROP CONSTRAINT IF EXISTS "channel_import_source_createdBy_fkey";
--> statement-breakpoint
ALTER TABLE "channel_import_source" ADD CONSTRAINT "channel_import_source_createdBy_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint

-- organization_address → organization (blocks org deletion)
ALTER TABLE "organization_address" DROP CONSTRAINT IF EXISTS "organization_address_organization_id_fkey";
--> statement-breakpoint
ALTER TABLE "organization_address" DROP CONSTRAINT IF EXISTS "organization_address_organization_fkey";
--> statement-breakpoint
ALTER TABLE "organization_address" ADD CONSTRAINT "organization_address_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint

-- organization_leader → organization (blocks org deletion)
ALTER TABLE "organization_leader" DROP CONSTRAINT IF EXISTS "organization_leader_organization_id_fkey";
--> statement-breakpoint
ALTER TABLE "organization_leader" DROP CONSTRAINT IF EXISTS "organization_leader_organization_fkey";
--> statement-breakpoint
ALTER TABLE "organization_leader" ADD CONSTRAINT "organization_leader_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint

-- organization_tag_instance → organization (blocks org deletion)
ALTER TABLE "organization_tag_instance" DROP CONSTRAINT IF EXISTS "organization_tag_instance_organization_id_fkey";
--> statement-breakpoint
ALTER TABLE "organization_tag_instance" DROP CONSTRAINT IF EXISTS "organization_tag_instance_organization_fkey";
--> statement-breakpoint
ALTER TABLE "organization_tag_instance" ADD CONSTRAINT "organization_tag_instance_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint

-- organization_tag_instance → organization_tag (blocks tag deletion)
ALTER TABLE "organization_tag_instance" DROP CONSTRAINT IF EXISTS "organization_tag_instance_tag_slug_fkey";
--> statement-breakpoint
ALTER TABLE "organization_tag_instance" DROP CONSTRAINT IF EXISTS "organization_tag_instance_tag_fkey";
--> statement-breakpoint
ALTER TABLE "organization_tag_instance" ADD CONSTRAINT "organization_tag_instance_tag_fkey" FOREIGN KEY ("tag_slug") REFERENCES "public"."organization_tag"("slug") ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint

-- organization_tag_suggestion → organization_tag parent (blocks tag deletion)
ALTER TABLE "organization_tag_suggestion" DROP CONSTRAINT IF EXISTS "organization_tag_suggestion_parent_slug_fkey";
--> statement-breakpoint
ALTER TABLE "organization_tag_suggestion" DROP CONSTRAINT IF EXISTS "organization_tag_suggestion_parent_fkey";
--> statement-breakpoint
ALTER TABLE "organization_tag_suggestion" ADD CONSTRAINT "organization_tag_suggestion_parent_fkey" FOREIGN KEY ("parent_slug") REFERENCES "public"."organization_tag"("slug") ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint

-- organization_tag_suggestion → organization_tag suggested (blocks tag deletion)
ALTER TABLE "organization_tag_suggestion" DROP CONSTRAINT IF EXISTS "organization_tag_suggestion_recommended_slug_fkey";
--> statement-breakpoint
ALTER TABLE "organization_tag_suggestion" DROP CONSTRAINT IF EXISTS "organization_tag_suggestion_suggested_fkey";
--> statement-breakpoint
ALTER TABLE "organization_tag_suggestion" ADD CONSTRAINT "organization_tag_suggestion_suggested_fkey" FOREIGN KEY ("recommended_slug") REFERENCES "public"."organization_tag"("slug") ON DELETE cascade ON UPDATE cascade;
