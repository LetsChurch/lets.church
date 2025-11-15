-- CreateTable
CREATE TABLE "featured_upload" (
    "upload_record_id" UUID NOT NULL,
    "rank" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "featured_upload_pkey" PRIMARY KEY ("upload_record_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "featured_upload_upload_record_id_key" ON "featured_upload"("upload_record_id");

-- CreateIndex
CREATE INDEX "featured_upload_rank_idx" ON "featured_upload"("rank");

-- AddForeignKey
ALTER TABLE "featured_upload" ADD CONSTRAINT "featured_upload_upload_record_id_fkey" FOREIGN KEY ("upload_record_id") REFERENCES "upload_record"("id") ON DELETE CASCADE ON UPDATE CASCADE;
