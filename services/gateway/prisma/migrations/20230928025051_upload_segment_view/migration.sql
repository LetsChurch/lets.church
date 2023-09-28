-- CreateTable
CREATE TABLE "upload_segment_view" (
    "upload_record_id" UUID NOT NULL,
    "viewer_hash" BIGINT NOT NULL,
    "app_user_id" UUID,
    "segment_start_time" DOUBLE PRECISION NOT NULL,
    "segment_end_time" DOUBLE PRECISION NOT NULL,
    "segment_total_time" DOUBLE PRECISION NOT NULL,
    "view_timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_segment_view_pkey" PRIMARY KEY ("view_timestamp","upload_record_id","viewer_hash")
);

-- AddForeignKey
ALTER TABLE "upload_segment_view" ADD CONSTRAINT "upload_segment_view_upload_record_id_fkey" FOREIGN KEY ("upload_record_id") REFERENCES "upload_record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_segment_view" ADD CONSTRAINT "upload_segment_view_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
