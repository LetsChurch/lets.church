-- CreateEnum
CREATE TYPE "channel_import_source_workflow_status" AS ENUM ('NOT_STARTED', 'RUNNING', 'PAUSED', 'FAILED');

-- CreateEnum
CREATE TYPE "channel_import_run_status" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED', 'PARTIAL');

-- CreateTable
CREATE TABLE "channel_import_source" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "channel_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "cron_schedule" TEXT NOT NULL DEFAULT '0 1 * * *',
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "last_imported_at" TIMESTAMP(3),
    "last_successful_import_at" TIMESTAMP(3),
    "last_error_at" TIMESTAMP(3),
    "last_error_message" TEXT,
    "earliest_import_date" TIMESTAMP(3),
    "last_imported_upload_date" TIMESTAMP(3),
    "deduplication_enabled" BOOLEAN NOT NULL DEFAULT false,
    "deduplication_fields" JSONB,
    "workflow_id" VARCHAR(255),
    "workflow_status" "channel_import_source_workflow_status" NOT NULL DEFAULT 'NOT_STARTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_id" UUID,

    CONSTRAINT "channel_import_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_import_run" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "import_source_id" UUID NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "status" "channel_import_run_status" NOT NULL,
    "items_found" INTEGER NOT NULL DEFAULT 0,
    "items_imported" INTEGER NOT NULL DEFAULT 0,
    "items_skipped" INTEGER NOT NULL DEFAULT 0,
    "items_failed" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "error_details" JSONB,

    CONSTRAINT "channel_import_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "import_source_id" UUID NOT NULL,
    "upload_record_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT,
    "published_at" TIMESTAMP(3) NOT NULL,
    "source" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "channel_import_source_channel_id_idx" ON "channel_import_source"("channel_id");

-- CreateIndex
CREATE INDEX "channel_import_source_enabled_idx" ON "channel_import_source"("enabled");

-- CreateIndex
CREATE INDEX "channel_import_source_workflow_status_idx" ON "channel_import_source"("workflow_status");

-- CreateIndex
CREATE INDEX "channel_import_run_import_source_id_started_at_idx" ON "channel_import_run"("import_source_id", "started_at");

-- CreateIndex
CREATE INDEX "channel_import_run_status_idx" ON "channel_import_run"("status");

-- CreateIndex
CREATE INDEX "import_history_import_source_id_published_at_idx" ON "import_history"("import_source_id", "published_at");

-- CreateIndex
CREATE INDEX "import_history_import_source_id_title_idx" ON "import_history"("import_source_id", "title");

-- CreateIndex
CREATE INDEX "import_history_import_source_id_url_idx" ON "import_history"("import_source_id", "url");

-- AddForeignKey
ALTER TABLE "channel_import_source" ADD CONSTRAINT "channel_import_source_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_import_source" ADD CONSTRAINT "channel_import_source_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_import_source" ADD CONSTRAINT "channel_import_source_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_import_run" ADD CONSTRAINT "channel_import_run_import_source_id_fkey" FOREIGN KEY ("import_source_id") REFERENCES "channel_import_source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_history" ADD CONSTRAINT "import_history_import_source_id_fkey" FOREIGN KEY ("import_source_id") REFERENCES "channel_import_source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_history" ADD CONSTRAINT "import_history_upload_record_id_fkey" FOREIGN KEY ("upload_record_id") REFERENCES "upload_record"("id") ON DELETE SET NULL ON UPDATE CASCADE;
