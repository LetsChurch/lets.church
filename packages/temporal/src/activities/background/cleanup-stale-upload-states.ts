import { prisma } from '@letschurch/db';
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

  const count = await prisma.uploadState.count({
    where: {
      backupStatus: 'NOT_BACKED_UP',
      createdAt: {
        lt: thresholdDate,
      },
    },
  });

  return count;
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
  const staleStates = await prisma.uploadState.findMany({
    where: {
      backupStatus: 'NOT_BACKED_UP',
      createdAt: {
        lt: thresholdDate,
      },
    },
    take: batchSize,
    select: {
      id: true,
      s3Key: true,
      uploadType: true,
    },
  });

  if (staleStates.length === 0) {
    return { deleted: 0, remaining: 0 };
  }

  // Delete the stale states
  const deleteResult = await prisma.uploadState.deleteMany({
    where: {
      id: {
        in: staleStates.map((s) => s.id),
      },
    },
  });

  const remaining = await getStaleUploadStatesCount(olderThanDays);

  logger.info(
    `Cleaned up ${deleteResult.count} stale upload states (older than ${olderThanDays} days), ${remaining} remaining`,
  );

  return {
    deleted: deleteResult.count,
    remaining,
  };
}
