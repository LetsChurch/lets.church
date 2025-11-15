-- CreateEnum
CREATE TYPE "upload_list_type" AS ENUM ('SERIES', 'PLAYLIST');

-- CreateTable
CREATE TABLE "upload_list_entry" (
    "upload_list_id" UUID NOT NULL,
    "upload_record_id" UUID NOT NULL,
    "rank" VARCHAR(12) NOT NULL,

    CONSTRAINT "upload_list_entry_pkey" PRIMARY KEY ("upload_list_id","rank")
);

-- CreateTable
CREATE TABLE "upload_list" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "author_id" UUID NOT NULL,
    "channel_id" UUID,
    "type" "upload_list_type" NOT NULL,

    CONSTRAINT "upload_list_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "upload_list_entry_upload_list_id_upload_record_id_key" ON "upload_list_entry"("upload_list_id", "upload_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "upload_list_created_at_id_key" ON "upload_list"("created_at", "id");

-- AddForeignKey
ALTER TABLE "upload_list_entry" ADD CONSTRAINT "upload_list_entry_upload_list_id_fkey" FOREIGN KEY ("upload_list_id") REFERENCES "upload_list"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_list_entry" ADD CONSTRAINT "upload_list_entry_upload_record_id_fkey" FOREIGN KEY ("upload_record_id") REFERENCES "upload_record"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_list" ADD CONSTRAINT "upload_list_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_list" ADD CONSTRAINT "upload_list_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
