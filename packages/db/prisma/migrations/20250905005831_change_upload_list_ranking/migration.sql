/*
  Warnings:

  - The primary key for the `upload_list_entry` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `rank` column on the `upload_list_entry` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- DropIndex
DROP INDEX "public"."upload_list_entry_upload_list_id_upload_record_id_key";

-- AlterTable
ALTER TABLE "public"."upload_list_entry" DROP CONSTRAINT "upload_list_entry_pkey",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
DROP COLUMN "rank",
ADD COLUMN     "rank" INTEGER,
ADD CONSTRAINT "upload_list_entry_pkey" PRIMARY KEY ("upload_list_id", "upload_record_id");

-- CreateIndex
CREATE INDEX "upload_list_entry_upload_list_id_rank_created_at_idx" ON "public"."upload_list_entry"("upload_list_id", "rank", "created_at");
