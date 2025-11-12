-- CreateTable
CREATE TABLE "public"."upload_view_second" (
    "upload_record_id" UUID NOT NULL,
    "view_hash" BIGINT NOT NULL,
    "second" INTEGER NOT NULL,

    CONSTRAINT "upload_view_second_pkey" PRIMARY KEY ("upload_record_id","view_hash","second")
);

-- CreateIndex
CREATE INDEX "upload_view_second_upload_record_id_second_idx" ON "public"."upload_view_second"("upload_record_id", "second");

-- AddForeignKey
ALTER TABLE "public"."upload_view_second" ADD CONSTRAINT "upload_view_second_upload_record_id_view_hash_fkey" FOREIGN KEY ("upload_record_id", "view_hash") REFERENCES "public"."upload_view"("upload_record_id", "view_hash") ON DELETE RESTRICT ON UPDATE CASCADE;
