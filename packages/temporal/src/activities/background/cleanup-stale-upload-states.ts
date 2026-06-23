import { db, UploadState } from '@letschurch/db';
import { and, count, eq, inArray, lt } from 'drizzle-orm';
import logger from '../../util/logger';

export type CleanupStaleUploadStatesResult = {
  deleted: number;
  remaining: number;
};

/**
 * Get count of stale upload states that can be cleaned up.
 * Stale is defined as: not backed up and older than the threshold.
 */
export async function getStaleUploadStatesCount(
  olderThanDays: number,
): Promise<number> {
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - olderThanDays);

  const result = await db
    .select({ count: count(UploadState.id) })
    .from(UploadState)
    .where(
      and(
        eq(UploadState.backupStatus, 'NOT_BACKED_UP'),
        lt(UploadState.createdAt, thresholdDate),
      ),
    );

  return Number(result[0]?.count ?? 0);
}

/**
 * Delete a batch of stale upload states.
 * Only deletes records that are NOT_BACKED_UP and older than the threshold.
 */
export async function cleanupStaleUploadStatesBatch(
  batchSize: number,
  olderThanDays: number,
): Promise<CleanupStaleUploadStatesResult> {
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - olderThanDays);

  // Find stale upload states
  const staleStates = await db
    .select({
      id: UploadState.id,
      s3Key: UploadState.s3Key,
      uploadType: UploadState.uploadType,
    })
    .from(UploadState)
    .where(
      and(
        eq(UploadState.backupStatus, 'NOT_BACKED_UP'),
        lt(UploadState.createdAt, thresholdDate),
      ),
    )
    .limit(batchSize);

  if (staleStates.length === 0) {
    return { deleted: 0, remaining: 0 };
  }

  // Re-apply the stale predicate in the DELETE itself (not just the SELECT) so a
  // row the bulk-backup workflow claimed (NOT_BACKED_UP -> BACKING_UP) between
  // the select and the delete is NOT removed out from under an in-progress
  // backup. RETURNING gives the true deleted count.
  const deletedRows = await db
    .delete(UploadState)
    .where(
      and(
        inArray(
          UploadState.id,
          staleStates.map((s) => s.id),
        ),
        eq(UploadState.backupStatus, 'NOT_BACKED_UP'),
        lt(UploadState.createdAt, thresholdDate),
      ),
    )
    .returning({ id: UploadState.id });

  const deleted = deletedRows.length;
  const remaining = await getStaleUploadStatesCount(olderThanDays);

  logger.info(
    `Cleaned up ${deleted} stale upload states (older than ${olderThanDays} days), ${remaining} remaining`,
  );

  return {
    deleted,
    remaining,
  };
}
