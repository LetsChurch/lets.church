-- CreateTable
CREATE TABLE "public"."saved_media" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "app_user_id" UUID NOT NULL,
    "upload_record_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_media_app_user_id_created_at_idx" ON "public"."saved_media"("app_user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "saved_media_app_user_id_upload_record_id_key" ON "public"."saved_media"("app_user_id", "upload_record_id");

-- AddForeignKey
ALTER TABLE "public"."saved_media" ADD CONSTRAINT "saved_media_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."saved_media" ADD CONSTRAINT "saved_media_upload_record_id_fkey" FOREIGN KEY ("upload_record_id") REFERENCES "public"."upload_record"("id") ON DELETE CASCADE ON UPDATE CASCADE;
