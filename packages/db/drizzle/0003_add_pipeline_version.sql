ALTER TABLE "upload_record" ADD COLUMN "pipeline_version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "upload_record" ALTER COLUMN "pipeline_version" SET DEFAULT 2;
