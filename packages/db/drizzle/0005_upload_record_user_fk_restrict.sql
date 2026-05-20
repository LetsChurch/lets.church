ALTER TABLE "upload_record" DROP CONSTRAINT "upload_record_createdBy_fkey";
--> statement-breakpoint
ALTER TABLE "upload_record" DROP CONSTRAINT "upload_record_uploadFinalizedBy_fkey";
--> statement-breakpoint
ALTER TABLE "upload_record" ADD CONSTRAINT "upload_record_createdBy_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_user"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "upload_record" ADD CONSTRAINT "upload_record_uploadFinalizedBy_fkey" FOREIGN KEY ("upload_finalized_by_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE cascade;