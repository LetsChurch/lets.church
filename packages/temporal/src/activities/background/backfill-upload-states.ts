import { prisma } from '@letschurch/db';
import type { UploadStateType } from '@letschurch/db/generated/prisma/client';
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
  const mediaCount = await prisma.uploadRecord.count({
    where: {
      uploadFinalized: true,
      finalizedUploadKey: { not: null },
      uploadStates: {
        none: {
          uploadType: 'MEDIA',
        },
      },
    },
  });

  return mediaCount;
}

/**
 * Backfill a batch of upload states for finalized media uploads.
 */
async function backfillMediaBatch(
  batchSize: number,
  ingestBucket: string,
): Promise<number> {
  const uploads = await prisma.uploadRecord.findMany({
    where: {
      uploadFinalized: true,
      finalizedUploadKey: { not: null },
      uploadStates: {
        none: {
          uploadType: 'MEDIA',
        },
      },
    },
    take: batchSize,
    select: {
      id: true,
      finalizedUploadKey: true,
      uploadSizeBytes: true,
    },
  });

  if (uploads.length === 0) return 0;

  const uploadsWithKeys = uploads.filter(
    (upload): upload is typeof upload & { finalizedUploadKey: string } =>
      upload.finalizedUploadKey !== null,
  );

  await prisma.uploadState.createMany({
    data: uploadsWithKeys.map((upload) => ({
      s3Key: upload.finalizedUploadKey,
      s3Bucket: ingestBucket,
      uploadType: 'MEDIA' as UploadStateType,
      sizeBytes: upload.uploadSizeBytes,
      uploadRecordId: upload.id,
      backupStatus: 'NOT_BACKED_UP' as const,
    })),
    skipDuplicates: true,
  });

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
