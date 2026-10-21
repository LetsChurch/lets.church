import {
  ApplicationFailure,
  ParentClosePolicy,
  proxyActivities,
  setCurrentDetails,
  startChild,
} from '@temporalio/workflow';

// Through import-source rather than activities/import, which would pull the
// import worker's ES2023 download code into every worker package's typecheck.
import type * as importSourceActivities from '../../activities/import-source';
import { BACKGROUND_QUEUE, IMPORT_QUEUE, PRIORITY_IMPORT } from '../../queues';
import {
  CHANNEL_ID_KEY,
  CHANNEL_SLUG_KEY,
  USER_ID_KEY,
  USERNAME_KEY,
} from '../../search-attributes';
import { staticMeta } from '../../util/dashboard-links';
import {
  type BulkMediaImportItem,
  bulkImportMediaWorkflow,
} from './bulk-import-media';

// Scraping runs on IMPORT_QUEUE: the import worker owns outbound fetches.
const { scrapeMediaFeed } = proxyActivities<typeof importSourceActivities>({
  startToCloseTimeout: '5 minutes',
  taskQueue: IMPORT_QUEUE,
  retry: { maximumAttempts: 3 },
});

// Same coordinator size as the CSV path keeps child payloads bounded.
const BATCH_SIZE = 250;

export type ImportFeedWorkflowParams = {
  feedImportId: string;
  feedUrl: string;
  channelId: string;
  channelSlug: string;
  userId: string;
  username: string;
  /** Explicit choice; wins over the feed's declared license. */
  license?: string;
  /** Used when neither `license` nor the feed declares one. */
  defaultLicense: string;
  visibility: string;
  userCommentsEnabled: boolean;
  webUrl?: string;
  series?: { id: string; firstRank: number };
};

/**
 * One-time import of every media item in an RSS/podcast feed, in listening
 * order, optionally into a series. Each item becomes its own
 * importMediaWorkflow (via the same coordinator as CSV bulk imports) with the
 * feed's cover art as the thumbnail fallback. Recurring imports of a feed are
 * import sources, not this.
 */
export async function importFeedWorkflow({
  feedImportId,
  feedUrl,
  channelId,
  channelSlug,
  userId,
  username,
  license,
  defaultLicense,
  visibility,
  userCommentsEnabled,
  webUrl,
  series,
}: ImportFeedWorkflowParams): Promise<{
  itemCount: number;
  license: string;
}> {
  setCurrentDetails('Reading feed');
  const feed = await scrapeMediaFeed(feedUrl);
  if (feed.items.length === 0) {
    // Non-retryable: a plain Error in workflow code is a task failure that
    // Temporal retries forever instead of failing the execution.
    throw ApplicationFailure.nonRetryable(
      `Feed ${feedUrl} has no media items`,
      'EmptyFeed',
    );
  }

  const itemLicense = license ?? feed.license ?? defaultLicense;
  const items: BulkMediaImportItem[] = feed.items.map((item) => {
    const thumbnailUrl = item.imageUrl || feed.imageUrl;
    return {
      url: item.url,
      title: item.title || 'Untitled',
      ...(item.description ? { description: item.description } : {}),
      // The scraper only emits valid dates (see toMediaItem).
      ...(item.publishedAt
        ? { publishedAt: new Date(item.publishedAt).toISOString() }
        : {}),
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
    };
  });

  setCurrentDetails(`Launching imports for ${items.length} feed items`);
  for (let start = 0; start < items.length; start += BATCH_SIZE) {
    const batchIndex = start / BATCH_SIZE;
    await startChild(bulkImportMediaWorkflow, {
      taskQueue: BACKGROUND_QUEUE,
      workflowId: `bulkImportMedia:${channelSlug}:${feedImportId}:${batchIndex}`,
      priority: { priorityKey: PRIORITY_IMPORT },
      args: [
        {
          bulkImportId: feedImportId,
          firstItemIndex: start,
          channelId,
          channelSlug,
          userId,
          username,
          license: itemLicense,
          visibility,
          userCommentsEnabled,
          webUrl,
          series,
          items: items.slice(start, start + BATCH_SIZE),
        },
      ],
      typedSearchAttributes: [
        { key: CHANNEL_ID_KEY, value: channelId },
        { key: CHANNEL_SLUG_KEY, value: channelSlug },
        { key: USER_ID_KEY, value: userId },
        { key: USERNAME_KEY, value: username },
      ],
      parentClosePolicy: ParentClosePolicy.ABANDON,
      retry: { maximumAttempts: 5 },
      ...staticMeta({
        summary: `Feed import — ${channelSlug}`,
        links: [{ href: feedUrl, text: 'Source feed' }],
      }),
    });
  }

  setCurrentDetails(`Launched imports for ${items.length} feed items`);
  return { itemCount: items.length, license: itemLicense };
}
