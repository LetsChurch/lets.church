import { parseFeed } from '@rowanmanning/feed-parser';
import { htmlToMarkdown } from '../../../util/import/html-to-markdown';
import logger from '../../../util/logger';
import type { ScrapedMediaItem } from '../scrape-import-source';

const moduleLogger = logger.child({ module: 'scraper/rss' });

/**
 * Scrape RSS feed (default fallback)
 */
export async function scrapeRssFeed(
  url: string,
  earliestDate: Date | string | null,
): Promise<ScrapedMediaItem[]> {
  moduleLogger.info('RSS feed scraper starting');

  try {
    // Fetch and parse the RSS feed
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch RSS feed: ${response.statusText}`);
    }

    const feedText = await response.text();
    const feed = parseFeed(feedText);

    moduleLogger.info(`Parsed RSS feed with ${feed.items.length} items`);

    const results: ScrapedMediaItem[] = [];

    for (const item of feed.items) {
      // Extract media URL from enclosures (prefer video, then audio)
      let mediaUrl: string | null = null;

      // Try video media first
      if (item.mediaVideos.length > 0) {
        mediaUrl = item.mediaVideos[0].url;
      }
      // Fall back to audio media
      else if (item.mediaAudio.length > 0) {
        mediaUrl = item.mediaAudio[0].url;
      }
      // Fall back to any media
      else if (item.media.length > 0) {
        mediaUrl = item.media[0].url;
      }

      // Skip items without media URL
      if (!mediaUrl) {
        moduleLogger.info(`Skipping item without media URL: ${item.title}`);
        continue;
      }

      // Parse published date
      let publishedAt: Date | undefined;
      if (item.published) {
        publishedAt = new Date(item.published);
      }

      // Filter by earliest date if provided (skip items before the last import)
      // Items on the same day will be re-checked and caught by deduplication
      if (earliestDate && publishedAt) {
        const earliestDateObj = new Date(earliestDate);
        if (publishedAt < earliestDateObj) {
          moduleLogger.info(
            `Skipping item before earliest date: ${item.title}`,
          );
          continue;
        }
      }

      // Extract description from content or description field. Feed
      // descriptions are typically HTML, which the web app's Markdown render
      // pipeline drops, so convert to Markdown before storing.
      let description = '';
      if (item.description) {
        description = htmlToMarkdown(item.description);
      } else if (item.content) {
        description = htmlToMarkdown(item.content);
      }

      results.push({
        url: mediaUrl,
        title: item.title || 'Untitled',
        description,
        publishedAt,
      });
    }

    moduleLogger.info(`Scraped ${results.length} items from RSS feed`);
    return results;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    moduleLogger.error(`Failed to scrape RSS feed: ${errorMessage}`);
    throw error;
  }
}
