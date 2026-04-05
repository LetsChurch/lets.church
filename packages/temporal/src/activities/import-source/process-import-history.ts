import { ChannelImportSource, db, ImportHistory } from '@letschurch/db';
import { eq } from 'drizzle-orm';
import logger from '../../util/logger';

const moduleLogger = logger.child({
  module: 'activity/process-import-history',
});

export type HistoricalImportItem = {
  publishedAt: string;
  source?: string;
  title: string;
  description?: string;
  url?: string | null;
};

/**
 * Process historical import data to mark items as already imported (backfill).
 * Creates ImportHistory records and updates lastImportedUploadDate and earliestImportDate.
 * Returns the latest and earliest dates from the history.
 */
export async function processImportHistory(
  importSourceId: string,
  importHistory: HistoricalImportItem[],
): Promise<{
  latestDate: Date | null;
  earliestDate: Date | null;
}> {
  moduleLogger.info('Processing import history backfill', {
    importSourceId,
    itemCount: importHistory.length,
  });

  let latestDate: Date | null = null;
  let earliestDate: Date | null = null;

  // Create ImportHistory records for each item
  const historyRecords = importHistory.map((item) => {
    const publishedAt = new Date(item.publishedAt);

    // Track latest date
    if (!latestDate || publishedAt > latestDate) {
      latestDate = publishedAt;
    }

    // Track earliest date
    if (!earliestDate || publishedAt < earliestDate) {
      earliestDate = publishedAt;
    }

    return {
      importSourceId,
      title: item.title,
      description: item.description || null,
      url: item.url || null,
      publishedAt,
      source: item.source || null,
    };
  });

  // Bulk create import history records
  if (historyRecords.length > 0) {
    await db.insert(ImportHistory).values(historyRecords).onConflictDoNothing();
  }

  moduleLogger.info('Created import history records', {
    importSourceId,
    count: historyRecords.length,
  });

  // Update the import source timestamps to prevent re-importing these items
  const updates: {
    earliestImportDate?: Date;
    lastImportedUploadDate?: Date;
    updatedAt?: Date;
  } = {};

  if (earliestDate) {
    updates.earliestImportDate = earliestDate;
  }

  if (latestDate) {
    updates.lastImportedUploadDate = latestDate;
  }

  if (Object.keys(updates).length > 0) {
    await db
      .update(ChannelImportSource)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(ChannelImportSource.id, importSourceId));

    moduleLogger.info('Updated import source with backfill dates', {
      importSourceId,
      earliestDate,
      latestDate,
    });
  }

  return { latestDate, earliestDate };
}
