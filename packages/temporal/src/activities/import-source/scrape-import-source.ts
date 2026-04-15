import logger from '../../util/logger';
import { scrapeRssFeed } from './scrapers/rss';
import { scrapeRumble } from './scrapers/rumble';
import { scrapeSermonAudio } from './scrapers/sermonaudio';

const moduleLogger = logger.child({ module: 'scrape-import-source' });

export type ScrapedMediaItem = {
  url: string;
  title?: string;
  description?: string;
  publishedAt?: Date | string;
};

/**
 * Main scraper activity that routes to specific scrapers based on URL.
 * This activity runs on IMPORT_QUEUE (import worker).
 */
export async function scrapeImportSource(
  sourceUrl: string,
  lastImportedUploadDate: Date | string | null,
): Promise<ScrapedMediaItem[]> {
  const url = new URL(sourceUrl);
  const hostname = url.hostname.toLowerCase();

  moduleLogger.info(`Scraping import source: ${hostname}`);

  if (hostname.includes('sermonaudio.com')) {
    moduleLogger.info('Using SermonAudio scraper');
    return scrapeSermonAudio(sourceUrl, lastImportedUploadDate);
  }

  if (hostname.includes('rumble.com')) {
    moduleLogger.info('Using Rumble scraper');
    return scrapeRumble(sourceUrl, lastImportedUploadDate);
  }

  // Default: assume RSS feed
  moduleLogger.info('Using RSS feed scraper');
  return scrapeRssFeed(sourceUrl, lastImportedUploadDate);
}
