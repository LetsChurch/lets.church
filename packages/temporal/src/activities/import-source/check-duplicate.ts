import { ChannelImportSource, db, ImportHistory } from '@letschurch/db';
import { and, eq, or } from 'drizzle-orm';
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
  const source = await db
    .select()
    .from(ChannelImportSource)
    .where(eq(ChannelImportSource.id, importSourceId))
    .then((r) => r[0] ?? null);

  if (!source?.deduplicationEnabled || !source.deduplicationFields) {
    return false;
  }

  const fields = source.deduplicationFields as string[];

  // Build OR conditions for import history - match if ANY field matches
  const conditions = [];

  if (fields.includes('url') && item.url) {
    conditions.push(
      and(
        eq(ImportHistory.importSourceId, importSourceId),
        eq(ImportHistory.url, item.url),
      ),
    );
  }

  if (fields.includes('title') && item.title) {
    conditions.push(
      and(
        eq(ImportHistory.importSourceId, importSourceId),
        eq(ImportHistory.title, item.title),
      ),
    );
  }

  if (fields.includes('publishedAt') && item.publishedAt) {
    conditions.push(
      and(
        eq(ImportHistory.importSourceId, importSourceId),
        eq(ImportHistory.publishedAt, new Date(item.publishedAt)),
      ),
    );
  }

  // Check import history
  if (conditions.length > 0) {
    const existingHistory = await db
      .select()
      .from(ImportHistory)
      .where(or(...conditions))
      .limit(1)
      .then((r) => r[0] ?? null);

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
