import { db, UploadState } from '@letschurch/db';
import { LcS3Client } from '@letschurch/s3';
import { count, eq, isNull } from 'drizzle-orm';
import logger from '../../util/logger';

export type BackfillSizesBatchResult = {
  updated: number;
  skipped: number;
  remaining: number;
};

/**
 * Get count of UploadState records that need file sizes populated.
 */
export async function getBackfillSizesCount(): Promise<number> {
  const result = await db
    .select({ count: count(UploadState.id) })
    .from(UploadState)
    .where(isNull(UploadState.sizeBytes));
  return Number(result[0]?.count ?? 0);
}

/**
 * Backfill a batch of UploadState records with file sizes from S3.
 * Queries the ingest bucket to get the actual file size.
 */
export async function backfillUploadStateSizesBatch(
  batchSize: number,
  ingestBucket: string,
  ingestEndpoint: string,
  ingestRegion: string,
  ingestAccessKeyId: string,
  ingestSecretAccessKey: string,
): Promise<BackfillSizesBatchResult> {
  // Get UploadState records without sizeBytes
  const uploadStates = await db
    .select({
      id: UploadState.id,
      s3Key: UploadState.s3Key,
      s3Bucket: UploadState.s3Bucket,
    })
    .from(UploadState)
    .where(isNull(UploadState.sizeBytes))
    .orderBy(UploadState.createdAt)
    .limit(batchSize);

  if (uploadStates.length === 0) {
    return { updated: 0, skipped: 0, remaining: 0 };
  }

  // Create S3 client for the ingest bucket
  const s3Client = new LcS3Client({
    endpoint: ingestEndpoint,
    region: ingestRegion,
    accessKeyId: ingestAccessKeyId,
    secretAccessKey: ingestSecretAccessKey,
    bucket: ingestBucket,
  });

  let updated = 0;
  let skipped = 0;

  // Process each upload state
  for (const uploadState of uploadStates) {
    try {
      // Only query if the bucket matches the ingest bucket
      if (uploadState.s3Bucket !== ingestBucket) {
        logger.warn(
          `Skipping UploadState ${uploadState.id} - bucket mismatch: ${uploadState.s3Bucket} !== ${ingestBucket}`,
        );
        skipped++;
        continue;
      }

      const head = await s3Client.headObject(uploadState.s3Key);

      if (head?.ContentLength) {
        await db
          .update(UploadState)
          .set({ sizeBytes: BigInt(head.ContentLength), updatedAt: new Date() })
          .where(eq(UploadState.id, uploadState.id));
        updated++;
      } else {
        logger.warn(
          `Could not get size for UploadState ${uploadState.id}, key: ${uploadState.s3Key}`,
        );
        skipped++;
      }
    } catch (error) {
      logger.error(
        {
          context: {
            uploadStateId: uploadState.id,
            error: error instanceof Error ? error.message : String(error),
            s3Key: uploadState.s3Key,
          },
        },
        `Error getting size for UploadState ${uploadState.id}`,
      );
      skipped++;
    }
  }

  const remaining = await getBackfillSizesCount();

  logger.info(
    `Backfilled ${updated} file sizes, skipped ${skipped}, ${remaining} remaining`,
  );

  return { updated, skipped, remaining };
}
