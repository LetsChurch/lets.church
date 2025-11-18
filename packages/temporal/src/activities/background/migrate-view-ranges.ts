import { prisma } from '@letschurch/db';
import logger from '../../util/logger';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/migrate-view-ranges',
});

type Range = {
  start: number;
  end: number;
};

/**
 * Get the total count of remaining UploadViewRanges rows to migrate
 */
export async function getMigrationCount(): Promise<number> {
  return prisma.uploadViewRanges.count();
}

/**
 * Get migration progress statistics
 */
export async function getMigrationStats(): Promise<{
  remaining: number;
  totalSeconds: number;
}> {
  const [remaining, totalSeconds] = await Promise.all([
    prisma.uploadViewRanges.count(),
    prisma.uploadViewSecond.count(),
  ]);

  return { remaining, totalSeconds };
}

/**
 * Migrate a batch of UploadViewRanges to UploadViewSecond
 * Each range is converted to individual second entries
 * The migration is transactional - either all rows in the batch succeed or none do
 */
export async function migrateViewRangesBatch(batchSize: number): Promise<{
  processed: number;
  secondsCreated: number;
  remaining: number;
}> {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'migrateViewRangesBatch',
    batchSize,
  });

  activityLogger.info('Starting batch migration');

  // Get batch of rows to migrate
  const rows = await prisma.uploadViewRanges.findMany({
    take: batchSize,
    orderBy: { viewTimestamp: 'asc' },
  });

  if (rows.length === 0) {
    activityLogger.info('No rows to migrate');
    return { processed: 0, secondsCreated: 0, remaining: 0 };
  }

  activityLogger.info(`Found ${rows.length} rows to migrate`);

  let totalSecondsCreated = 0;

  // Process in a transaction
  await prisma.$transaction(
    async (tx) => {
      for (const row of rows) {
        const ranges = row.ranges as Array<Range>;

        // First, ensure the UploadView exists (upsert)
        await tx.uploadView.upsert({
          where: {
            uploadRecordId_viewHash: {
              uploadRecordId: row.uploadRecordId,
              viewHash: row.viewHash,
            },
          },
          create: {
            uploadRecordId: row.uploadRecordId,
            viewHash: row.viewHash,
            appUserId: row.appUserId,
            createdAt: row.viewTimestamp,
            count: 1,
          },
          update: {
            // If it already exists, we don't need to update anything
          },
        });

        // Convert ranges to individual seconds
        const seconds = new Set<number>();

        for (const range of ranges) {
          const startSecond = Math.floor(range.start);
          const endSecond = Math.floor(range.end);

          for (let second = startSecond; second <= endSecond; second++) {
            seconds.add(second);
          }
        }

        // Create UploadViewSecond entries
        if (seconds.size > 0) {
          const secondsArray = Array.from(seconds);

          // Use createMany with skipDuplicates to handle any existing entries
          await tx.uploadViewSecond.createMany({
            data: secondsArray.map((second) => ({
              uploadRecordId: row.uploadRecordId,
              viewHash: row.viewHash,
              second,
            })),
            skipDuplicates: true,
          });

          totalSecondsCreated += seconds.size;
        }

        // Delete the old UploadViewRanges row
        await tx.uploadViewRanges.delete({
          where: { id: row.id },
        });
      }
    },
    {
      timeout: 60000, // 1 minute timeout for the transaction
    },
  );

  const remaining = await prisma.uploadViewRanges.count();

  activityLogger.info(
    `Migrated ${rows.length} rows, created ${totalSecondsCreated} second entries, ${remaining} remaining`,
  );

  return {
    processed: rows.length,
    secondsCreated: totalSecondsCreated,
    remaining,
  };
}
