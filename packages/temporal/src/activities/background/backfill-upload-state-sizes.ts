import { db, UploadState } from '@letschurch/db';
import { LcS3Client } from '@letschurch/s3';
import { and, count, eq, gt, isNull, or } from 'drizzle-orm';
import logger from '../../util/logger';

/**
 * Keyset-pagination cursor identifying the last row processed by the previous
 * batch. We page forward by `(createdAt, id)` rather than always re-selecting
 * the first N `sizeBytes IS NULL` rows, which guarantees forward progress even
 * for rows that can never be resolved (missing S3 object, bucket mismatch).
 * Without this, a block of unresolvable rows at the front of the ordering
 * stalls the workflow in an infinite loop, since skipped rows keep
 * `sizeBytes = NULL` and get re-selected every batch.
 *
 * `createdAt` is an ISO string so the cursor survives continue-as-new
 * serialization intact.
 */
export type BackfillSizesCursor = {
  createdAt: string;
  id: string;
};

export type BackfillSizesBatchResult = {
  updated: number;
  skipped: number;
  /** Rows examined this batch (updated + skipped). */
  processed: number;
  /** Live count of rows still lacking a size (informational; not a stop signal). */
  remaining: number;
  /** Cursor to pass to the next batch, or null when nothing was processed. */
  nextCursor: BackfillSizesCursor | null;
  /** True once the end of the NULL set has been reached. */
  done: boolean;
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
 *
 * Pages forward with a keyset cursor so each batch advances past the rows it
 * examined regardless of whether they were updated or skipped. A single pass
 * covers every currently-NULL row exactly once and then reports `done`.
 */
export async function backfillUploadStateSizesBatch(
  batchSize: number,
  ingestBucket: string,
  ingestEndpoint: string,
  ingestRegion: string,
  ingestAccessKeyId: string,
  ingestSecretAccessKey: string,
  cursor: BackfillSizesCursor | null,
): Promise<BackfillSizesBatchResult> {
  // Keyset filter: only rows after the cursor, ordered by (createdAt, id).
  const cursorFilter = cursor
    ? or(
        gt(UploadState.createdAt, new Date(cursor.createdAt)),
        and(
          eq(UploadState.createdAt, new Date(cursor.createdAt)),
          gt(UploadState.id, cursor.id),
        ),
      )
    : undefined;

  // Get UploadState records without sizeBytes
  const uploadStates = await db
    .select({
      id: UploadState.id,
      s3Key: UploadState.s3Key,
      s3Bucket: UploadState.s3Bucket,
      createdAt: UploadState.createdAt,
    })
    .from(UploadState)
    .where(and(isNull(UploadState.sizeBytes), cursorFilter))
    .orderBy(UploadState.createdAt, UploadState.id)
    .limit(batchSize);

  if (uploadStates.length === 0) {
    // Reached the end of the NULL set — nothing left after the cursor.
    const remaining = await getBackfillSizesCount();
    return {
      updated: 0,
      skipped: 0,
      processed: 0,
      remaining,
      nextCursor: cursor,
      done: true,
    };
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

  // Advance the cursor past the last row we examined. A short page (fewer rows
  // than requested) means there is nothing left after it, so we're done.
  const lastRow = uploadStates.at(-1);
  if (!lastRow) {
    // Unreachable: we return above when the page is empty.
    throw new Error('Unexpected empty batch after non-empty guard');
  }
  const nextCursor: BackfillSizesCursor = {
    createdAt: lastRow.createdAt.toISOString(),
    id: lastRow.id,
  };
  const done = uploadStates.length < batchSize;

  const remaining = await getBackfillSizesCount();

  logger.info(
    `Backfilled ${updated} file sizes, skipped ${skipped}, ${remaining} remaining`,
  );

  return {
    updated,
    skipped,
    processed: uploadStates.length,
    remaining,
    nextCursor,
    done,
  };
}
