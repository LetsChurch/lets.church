import { parseFeed } from '@rowanmanning/feed-parser';
import { ApplicationFailure } from '@temporalio/activity';

import { htmlToMarkdown } from '../../../util/import/html-to-markdown';
import { safeFetch } from '../../../util/import/safe-url';
import { USER_AGENT } from '../../../util/import/user-agent';
import logger from '../../../util/logger';
import type { ScrapedMediaItem } from '../scrape-import-source';

const moduleLogger = logger.child({ module: 'scraper/rss' });

// The scraped feed travels back through Temporal as one activity result,
// which the server rejects past a few MiB. Stay well under it.
const MAX_FEED_RESULT_BYTES = 1.5 * 1024 * 1024;
const MAX_DESCRIPTION_LENGTH = 10_000;

type Feed = ReturnType<typeof parseFeed>;
type FeedItem = Feed['items'][number];

export type FeedLicense =
  | 'PUBLIC_DOMAIN'
  | 'CC0'
  | 'CC_BY'
  | 'CC_BY_SA'
  | 'CC_BY_NC'
  | 'CC_BY_NC_SA'
  | 'CC_BY_ND'
  | 'CC_BY_NC_ND';

export type ScrapedMediaFeed = {
  title: string | null;
  imageUrl: string | null;
  license: FeedLicense | null;
  /** In listening order (see {@link orderFeedItems}). */
  items: ScrapedMediaItem[];
};

async function fetchFeed(url: string): Promise<Feed> {
  // Fetch and parse the RSS feed. safeFetch enforces the SSRF policy on the
  // feed URL (and redirects) so a malicious feed source can't point the worker
  // at internal services. Cap the body since we buffer the whole feed via
  // `.text()` — a feed has no business being larger than this.
  const response = await safeFetch(
    url,
    { headers: { 'User-Agent': USER_AGENT } },
    { maxBytes: 32 * 1024 * 1024 },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch RSS feed: ${response.statusText}`);
  }

  const feed = parseFeed(await response.text());
  moduleLogger.info(`Parsed RSS feed with ${feed.items.length} items`);
  return feed;
}

function toMediaItem(item: FeedItem): ScrapedMediaItem | null {
  // Extract media URL from enclosures (prefer video, then audio, then any)
  const mediaUrl =
    item.mediaVideos[0]?.url ?? item.mediaAudio[0]?.url ?? item.media[0]?.url;

  if (!mediaUrl) {
    moduleLogger.info(`Skipping item without media URL: ${item.title}`);
    return null;
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

  const itunesNumber = (name: string) => {
    const text = item.element
      .findElementsWithName(name)
      .find((el) => el.namespace === 'itunes')?.textContentNormalized;
    return text ? Number.parseInt(text, 10) : NaN;
  };
  const episode = itunesNumber('episode');
  const season = itunesNumber('season');

  // Drop unparseable dates rather than carry an Invalid Date downstream, where
  // `toISOString()` would throw.
  const publishedAt = item.published ? new Date(item.published) : null;

  return {
    url: mediaUrl,
    title: item.title || 'Untitled',
    description,
    ...(publishedAt && !Number.isNaN(publishedAt.getTime())
      ? { publishedAt }
      : {}),
    ...(Number.isFinite(episode) ? { episode } : {}),
    ...(Number.isFinite(season) ? { season } : {}),
    ...(item.image?.url ? { imageUrl: item.image.url } : {}),
  };
}

/**
 * Scrape RSS feed (default fallback)
 */
export async function scrapeRssFeed(
  url: string,
  earliestDate: Date | string | null,
): Promise<ScrapedMediaItem[]> {
  moduleLogger.info('RSS feed scraper starting');

  try {
    const feed = await fetchFeed(url);
    const results: ScrapedMediaItem[] = [];

    for (const feedItem of feed.items) {
      const item = toMediaItem(feedItem);
      if (!item) continue;

      // Filter by earliest date if provided (skip items before the last import)
      // Items on the same day will be re-checked and caught by deduplication
      if (earliestDate && item.publishedAt) {
        if (new Date(item.publishedAt) < new Date(earliestDate)) {
          moduleLogger.info(
            `Skipping item before earliest date: ${item.title}`,
          );
          continue;
        }
      }

      results.push(item);
    }

    moduleLogger.info(`Scraped ${results.length} items from RSS feed`);
    return results;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    moduleLogger.error(`Failed to scrape RSS feed: ${errorMessage}`);
    throw error;
  }
}

/**
 * Map a feed's declared license (`podcast:license`, falling back to
 * `<copyright>`) onto our license enum. Anything unrecognized — including a
 * plain "© 2024 Some Church" — is null, so the caller keeps its default.
 */
export function feedLicense(
  declarations: ReadonlyArray<string | null | undefined>,
): FeedLicense | null {
  for (const declaration of declarations) {
    if (!declaration) continue;
    const text = declaration.toLowerCase().replaceAll(/[\s_]+/g, '-');

    if (/\bcc0\b|publicdomain\/zero/.test(text)) return 'CC0';
    if (/public-?domain/.test(text)) return 'PUBLIC_DOMAIN';
    if (/\bby-nc-nd\b/.test(text)) return 'CC_BY_NC_ND';
    if (/\bby-nc-sa\b/.test(text)) return 'CC_BY_NC_SA';
    if (/\bby-nc\b/.test(text)) return 'CC_BY_NC';
    if (/\bby-nd\b/.test(text)) return 'CC_BY_ND';
    if (/\bby-sa\b/.test(text)) return 'CC_BY_SA';
    if (/\b(cc-by|licenses\/by)\b/.test(text)) return 'CC_BY';
  }
  return null;
}

/**
 * Put feed items in listening order. Season then episode number wins when
 * every item has an episode number (audiobooks and serial podcasts; a missing
 * season counts as 0, since episodes restart each season); otherwise oldest-first by publish
 * date; otherwise the reverse of document order, since feeds list newest
 * first.
 */
export function orderFeedItems(items: ScrapedMediaItem[]): ScrapedMediaItem[] {
  if (items.length > 0 && items.every((item) => item.episode !== undefined)) {
    return items.toSorted(
      (a, b) => (a.season ?? 0) - (b.season ?? 0) || a.episode! - b.episode!,
    );
  }
  if (items.length > 0 && items.every((item) => item.publishedAt)) {
    return items.toSorted(
      (a, b) =>
        new Date(a.publishedAt!).getTime() - new Date(b.publishedAt!).getTime(),
    );
  }
  return items.toReversed();
}

/**
 * Scrape a whole feed for a one-time import into a series: every media item in
 * listening order, plus the feed-level title, cover art and license.
 */
export async function scrapeMediaFeed(url: string): Promise<ScrapedMediaFeed> {
  const feed = await fetchFeed(url);
  const items = feed.items
    .map(toMediaItem)
    .filter((item): item is ScrapedMediaItem => item !== null);

  const license = feed.element
    .findElementsWithName('license')
    .find((el) => el.namespace === 'podcast');

  for (const item of items) {
    if (item.description && item.description.length > MAX_DESCRIPTION_LENGTH) {
      item.description = `${item.description.slice(0, MAX_DESCRIPTION_LENGTH - 1)}…`;
    }
  }

  const result: ScrapedMediaFeed = {
    title: feed.title,
    imageUrl: feed.image?.url ?? null,
    license: feedLicense([
      license?.textContentNormalized,
      license?.getAttribute('url'),
      feed.copyright,
    ]),
    items: orderFeedItems(items),
  };

  const resultBytes = Buffer.byteLength(JSON.stringify(result));
  if (resultBytes > MAX_FEED_RESULT_BYTES) {
    throw ApplicationFailure.nonRetryable(
      `Feed has ${items.length} items (${resultBytes} bytes), too large for a one-time import. Use a CSV import or an import source instead.`,
    );
  }

  return result;
}
