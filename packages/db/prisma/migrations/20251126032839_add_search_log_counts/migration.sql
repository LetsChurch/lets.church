-- AlterTable
ALTER TABLE "search_log_entry" ADD COLUMN     "channel_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "media_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "transcript_count" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "search_log_entry_created_at_idx" ON "search_log_entry"("created_at" DESC);
