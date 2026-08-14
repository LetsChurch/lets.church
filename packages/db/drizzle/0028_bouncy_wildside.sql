ALTER TABLE "upload_record" ADD COLUMN "creation_operation_id" text;--> statement-breakpoint
ALTER TABLE "upload_record" ADD COLUMN "creation_request_fingerprint" text;--> statement-breakpoint
CREATE UNIQUE INDEX "upload_record_creation_operation_id_unique_idx" ON "upload_record" USING btree ("creation_operation_id");