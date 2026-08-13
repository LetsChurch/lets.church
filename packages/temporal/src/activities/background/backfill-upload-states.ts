import { db, UploadRecord, UploadState } from '@letschurch/db';
import { and, count, eq, isNotNull, notExists } from 'drizzle-orm';

import logger from '../../util/logger';

const missingMediaUploadState = notExists(
  db
    .select({ id: UploadState.id })
    .from(UploadState)
    .where(
      and(
        eq(UploadState.uploadType, 'MEDIA'),
        eq(UploadState.uploadRecordId, UploadRecord.id),
      ),
    ),
);

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
  const result = await db
    .select({ count: count() })
    .from(UploadRecord)
    .where(
      and(
        eq(UploadRecord.uploadFinalized, true),
        isNotNull(UploadRecord.finalizedUploadKey),
        missingMediaUploadState,
      ),
    );

  return result[0]?.count ?? 0;
}

/**
 * Backfill a batch of upload states for finalized media uploads.
 */
async function backfillMediaBatch(
  batchSize: number,
  ingestBucket: string,
): Promise<number> {
  const uploads = await db
    .select({
      id: UploadRecord.id,
      finalizedUploadKey: UploadRecord.finalizedUploadKey,
      uploadSizeBytes: UploadRecord.uploadSizeBytes,
    })
    .from(UploadRecord)
    .where(
      and(
        eq(UploadRecord.uploadFinalized, true),
        isNotNull(UploadRecord.finalizedUploadKey),
        missingMediaUploadState,
      ),
    )
    .limit(batchSize);

  if (uploads.length === 0) return 0;

  const uploadsWithKeys = uploads.filter(
    (upload): upload is typeof upload & { finalizedUploadKey: string } =>
      upload.finalizedUploadKey !== null,
  );

  if (uploadsWithKeys.length === 0) return 0;

  await db
    .insert(UploadState)
    .values(
      uploadsWithKeys.map((upload) => ({
        s3Key: upload.finalizedUploadKey,
        s3Bucket: ingestBucket,
        uploadType: 'MEDIA' as const,
        sizeBytes: upload.uploadSizeBytes ?? undefined,
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
