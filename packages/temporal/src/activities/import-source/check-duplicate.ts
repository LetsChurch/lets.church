import { prisma } from '@letschurch/db';
import logger from '../../util/logger';
import type { ScrapedMediaItem } from './scrape-import-source';

const moduleLogger = logger.child({ module: 'check-duplicate' });

/**
 * Check if media item already exists based on deduplication settings.
 * Checks import history for this import source.
 * Returns true if duplicate found (should skip), false otherwise.
 */
export async function checkDuplicate(
  importSourceId: string,
  item: ScrapedMediaItem,
): Promise<boolean> {
  const source = await prisma.channelImportSource.findUnique({
    where: { id: importSourceId },
  });

  if (!source?.deduplicationEnabled || !source.deduplicationFields) {
    return false;
  }

  const fields = source.deduplicationFields as string[];

  // Build OR conditions for import history - match if ANY field matches
  const historyOrConditions: Array<{
    importSourceId: string;
    title?: string;
    publishedAt?: Date;
    url?: string;
  }> = [];

  if (fields.includes('url') && item.url) {
    historyOrConditions.push({
      importSourceId,
      url: item.url,
    });
  }

  if (fields.includes('title') && item.title) {
    historyOrConditions.push({
      importSourceId,
      title: item.title,
    });
  }

  if (fields.includes('publishedAt') && item.publishedAt) {
    historyOrConditions.push({
      importSourceId,
      publishedAt: item.publishedAt,
    });
  }

  // Check import history
  if (historyOrConditions.length > 0) {
    const existingHistory = await prisma.importHistory.findFirst({
      where: {
        OR: historyOrConditions,
      },
    });

    if (existingHistory) {
      moduleLogger.info('Duplicate found in import history, skipping import', {
        deduplicationFields: fields,
        url: item.url,
        matchedHistoryId: existingHistory.id,
      });
      return true;
    }
  }

  return false;
}
