-- CreateEnum
CREATE TYPE "upload_state_type" AS ENUM ('MEDIA', 'THUMBNAIL', 'PROFILE_AVATAR', 'CHANNEL_AVATAR', 'ORGANIZATION_AVATAR', 'CHANNEL_DEFAULT_THUMBNAIL');

-- CreateEnum
CREATE TYPE "backup_status" AS ENUM ('NOT_BACKED_UP', 'BACKING_UP', 'BACKED_UP', 'BACKUP_FAILED');

-- CreateTable
CREATE TABLE "upload_state" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "s3_key" TEXT NOT NULL,
    "s3_bucket" TEXT NOT NULL,
    "upload_type" "upload_state_type" NOT NULL,
    "size_bytes" BIGINT,
    "upload_record_id" UUID,
    "app_user_id" UUID,
    "channel_id" UUID,
    "organization_id" UUID,
    "backup_status" "backup_status" NOT NULL DEFAULT 'NOT_BACKED_UP',
    "backup_key" TEXT,
    "backed_up_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "upload_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "upload_state_s3_key_key" ON "upload_state"("s3_key");

-- CreateIndex
CREATE INDEX "upload_state_backup_status_idx" ON "upload_state"("backup_status");

-- CreateIndex
CREATE INDEX "upload_state_upload_type_idx" ON "upload_state"("upload_type");

-- AddForeignKey
ALTER TABLE "upload_state" ADD CONSTRAINT "upload_state_upload_record_id_fkey" FOREIGN KEY ("upload_record_id") REFERENCES "upload_record"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_state" ADD CONSTRAINT "upload_state_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_state" ADD CONSTRAINT "upload_state_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_state" ADD CONSTRAINT "upload_state_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
