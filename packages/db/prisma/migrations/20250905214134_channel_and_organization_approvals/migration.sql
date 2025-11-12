-- AlterTable
ALTER TABLE "public"."channel" ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "approved_by_id" UUID;

-- AlterTable
ALTER TABLE "public"."organization" ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "approved_by_id" UUID;

-- AddForeignKey
ALTER TABLE "public"."organization" ADD CONSTRAINT "organization_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "public"."app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."channel" ADD CONSTRAINT "channel_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "public"."app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
