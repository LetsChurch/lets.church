-- CreateTable
CREATE TABLE "upload_view_ranges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "upload_record_id" UUID NOT NULL,
    "viewer_hash" BIGINT NOT NULL,
    "app_user_id" UUID,
    "view_timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ranges" JSONB NOT NULL DEFAULT '[]',
    "total_time" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "upload_view_ranges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "upload_view_ranges_upload_record_id_viewer_hash_idx" ON "upload_view_ranges"("upload_record_id", "viewer_hash");

-- CreateIndex
CREATE INDEX "upload_view_ranges_view_timestamp_idx" ON "upload_view_ranges"("view_timestamp");

-- AddForeignKey
ALTER TABLE "upload_view_ranges" ADD CONSTRAINT "upload_view_ranges_upload_record_id_fkey" FOREIGN KEY ("upload_record_id") REFERENCES "upload_record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_view_ranges" ADD CONSTRAINT "upload_view_ranges_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
