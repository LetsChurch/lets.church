import { db, UploadState } from '@letschurch/db';
import { eq, sql } from 'drizzle-orm';

import logger from '../../util/logger';

export type BackfillBatchResult = {
  created: number;
  remaining: number;
};

/**
 * Get count of uploads that need to be backfilled into UploadState.
 * Only counts media uploads - images/avatars/thumbnails are handled by the
 * backfillOriginalImageUploadStatesWorkflow which scans probe files.
 */
export async function getBackfillCount(): Promise<number> {
  // Count finalized upload records that don't have an UploadState
  const _subquery = db
    .select({ id: UploadState.uploadRecordId })
    .from(UploadState)
    .where(eq(UploadState.uploadType, 'MEDIA'));

  const result = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*) as count
    FROM "upload_record"
    WHERE "upload_finalized" = true
      AND "finalized_upload_key" IS NOT NULL
      AND "id" NOT IN (
        SELECT "upload_record_id" FROM "upload_state"
        WHERE "upload_type" = 'MEDIA'
        AND "upload_record_id" IS NOT NULL
      )
  `);

  return Number(result.rows[0]?.count ?? 0);
}

/**
 * Backfill a batch of upload states for finalized media uploads.
 */
async function backfillMediaBatch(
  batchSize: number,
  ingestBucket: string,
): Promise<number> {
  const uploads = await db.execute<{
    id: string;
    finalized_upload_key: string | null;
    upload_size_bytes: string | null;
  }>(sql`
    SELECT id, finalized_upload_key, upload_size_bytes
    FROM "upload_record"
    WHERE "upload_finalized" = true
      AND "finalized_upload_key" IS NOT NULL
      AND "id" NOT IN (
        SELECT "upload_record_id" FROM "upload_state"
        WHERE "upload_type" = 'MEDIA'
        AND "upload_record_id" IS NOT NULL
      )
    LIMIT ${batchSize}
  `);

  if (uploads.rows.length === 0) return 0;

  const uploadsWithKeys = uploads.rows.filter(
    (upload): upload is typeof upload & { finalized_upload_key: string } =>
      upload.finalized_upload_key !== null,
  );

  if (uploadsWithKeys.length === 0) return 0;

  await db
    .insert(UploadState)
    .values(
      uploadsWithKeys.map((upload) => ({
        s3Key: upload.finalized_upload_key,
        s3Bucket: ingestBucket,
        uploadType: 'MEDIA' as const,
        sizeBytes: upload.upload_size_bytes
          ? BigInt(upload.upload_size_bytes)
          : undefined,
        uploadRecordId: upload.id,
        backupStatus: 'NOT_BACKED_UP' as const,
        updatedAt: new Date(),
      })),
    )
    .onConflictDoNothing();

  return uploadsWithKeys.length;
}

// Thumbnail and avatar backfilling removed - these are now handled by
// backfillOriginalImageUploadStatesWorkflow which scans the ingest bucket
// for .imagemagick.json probe files to find the original uploads.

/**
 * Backfill a batch of upload states from existing database records.
 * Only backfills media uploads - images/avatars/thumbnails are handled by
 * backfillOriginalImageUploadStatesWorkflow.
 * Returns the number of records created and remaining.
 */
export async function backfillUploadStatesBatch(
  batchSize: number,
  ingestBucket: string,
): Promise<BackfillBatchResult> {
  // Only process media uploads
  const created = await backfillMediaBatch(batchSize, ingestBucket);
  const remaining = await getBackfillCount();

  logger.info(`Backfilled ${created} media uploads, ${remaining} remaining`);

  return { created, remaining };
}
