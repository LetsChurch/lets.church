import {
  ParentClosePolicy,
  proxyActivities,
  startChild,
} from '@temporalio/workflow';

import type * as backgroundActivities from '../../activities/background';
import type * as importSourceActivities from '../../activities/import-source';
import { BACKGROUND_QUEUE, IMPORT_QUEUE, PRIORITY_IMPORT } from '../../queues';
import {
  CHANNEL_SLUG_KEY,
  IMPORT_SOURCE_ID_KEY,
  USERNAME_KEY,
} from '../../search-attributes';
import { importMediaWorkflow } from './import-media';

// Database activities run on BACKGROUND_QUEUE (background worker has DB access)
const {
  createImportRun,
  updateImportRun,
  checkDuplicate,
  getImportSource,
  updateImportSourceTimestamps,
  sendImportErrorNotification,
  processImportHistory,
  createImportHistory,
} = proxyActivities<typeof importSourceActivities>({
  startToCloseTimeout: '30 minutes',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 3 },
});

// Scraping activities run on IMPORT_QUEUE (import worker does the scraping)
const { scrapeImportSource } = proxyActivities<typeof importSourceActivities>({
  startToCloseTimeout: '30 minutes',
  taskQueue: IMPORT_QUEUE,
  retry: { maximumAttempts: 3 },
});

const { triggerPagerDutyAlert } = proxyActivities<typeof backgroundActivities>({
  startToCloseTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 3 },
});

/**
 * Scrapes an import source and kicks off importMedia workflows for each found item.
 * Optionally accepts historical import data to mark as already imported (backfill).
 */
export async function scrapeAndImportWorkflow(
  importSourceId: string,
  importHistory?: Array<{
    publishedAt: string;
    source?: string;
    title: string;
    description?: string;
    url?: string | null;
  }>,
  // Web origin captured by the starter (where WEB_URL is readable), threaded
  // down to each importMediaWorkflow so its processing children can carry
  // dashboard deep-links. Absent → children carry no links.
  webUrl?: string,
) {
  const runId = await createImportRun(importSourceId);

  try {
    // If import history provided, this is a backfill operation
    // We just update the timestamps and exit without actually importing
    if (importHistory) {
      const { latestDate } = await processImportHistory(
        importSourceId,
        importHistory,
      );

      await updateImportRun(runId, {
        status: 'COMPLETED',
        itemsFound: importHistory.length,
        itemsImported: 0,
        itemsSkipped: importHistory.length,
        itemsFailed: 0,
      });

      // Update source timestamps
      await updateImportSourceTimestamps(
        importSourceId,
        latestDate ?? undefined,
      );

      return;
    }

    // Normal scraping operation
    const source = await getImportSource(importSourceId);

    if (!source.createdBy) {
      throw new Error(
        `Import source ${importSourceId} has no creator (user was deleted)`,
      );
    }

    const { createdBy } = source;

    const items = await scrapeImportSource(
      source.url,
      source.lastImportedUploadDate,
    );

    let imported = 0;
    let skipped = 0;
    let failed = 0;
    // Max publishedAt among successful imports, and min among failures. The
    // cursor must not advance past the oldest failure, or that item (and any
    // older ones in the run) would be filtered out by the scraper next run.
    let latestUploadDate: string | undefined;
    let oldestFailedDate: string | undefined;

    // Process each item
    for (const item of items) {
      let uploadRecordId: string | null = null;

      // Media import: importMediaWorkflow sends its own error notification on failure.
      try {
        const isDuplicate = await checkDuplicate(importSourceId, item);

        if (isDuplicate) {
          skipped++;
          continue;
        }

        // Start import workflow for each item
        const urlHash = simpleHash(item.url);
        const handle = await startChild(importMediaWorkflow, {
          taskQueue: BACKGROUND_QUEUE,
          workflowId: `importMedia:${importSourceId}:${urlHash}:${Date.now()}`,
          priority: { priorityKey: PRIORITY_IMPORT },
          args: [
            {
              url: item.url,
              username: createdBy.username,
              channelSlug: source.channel.slug,
              title: item.title || 'Imported Media',
              description: item.description || null,
              publishedAt: item.publishedAt || new Date(),
              license: 'STANDARD',
              visibility: 'PUBLIC',
              userCommentsEnabled: true,
              trimSilence: false,
              taskQueue: BACKGROUND_QUEUE,
              importSourceId,
              channelId: source.channel?.id ?? null,
              webUrl,
            },
          ],
          typedSearchAttributes: [
            { key: IMPORT_SOURCE_ID_KEY, value: importSourceId },
            { key: CHANNEL_SLUG_KEY, value: source.channel.slug },
            { key: USERNAME_KEY, value: createdBy.username },
          ],
          parentClosePolicy: ParentClosePolicy.ABANDON,
          retry: { maximumAttempts: 3 },
        });
        uploadRecordId = await handle.result();
        imported++;

        // Advance the cursor only AFTER a successful import. Doing it before
        // (the old behavior) meant a failed item — especially one with a newer
        // publishedAt — pushed lastImportedUploadDate past itself, so it and any
        // older failed items in the run were skipped permanently on later runs.
        if (item.publishedAt) {
          const publishedAtStr = String(item.publishedAt);
          if (!latestUploadDate || publishedAtStr > latestUploadDate) {
            latestUploadDate = publishedAtStr;
          }
        }
      } catch (_error) {
        failed++;
        if (item.publishedAt) {
          const publishedAtStr = String(item.publishedAt);
          if (!oldestFailedDate || publishedAtStr < oldestFailedDate) {
            oldestFailedDate = publishedAtStr;
          }
        }
        continue;
      }

      // History record: handled separately so a failure here doesn't get
      // confused with a media import failure, and sends its own notification.
      try {
        await createImportHistory({
          importSourceId,
          uploadRecordId,
          title: item.title || 'Imported Media',
          description: item.description || undefined,
          url: item.url,
          publishedAt: item.publishedAt || new Date(),
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        await sendImportErrorNotification(
          importSourceId,
          `Imported ${item.url} but failed to record import history (future runs may re-import this item): ${errorMessage}`,
        );
      }
    }

    // Update import run with final stats
    await updateImportRun(runId, {
      status:
        failed > 0 && imported === 0
          ? 'FAILED'
          : failed > 0
            ? 'PARTIAL'
            : 'COMPLETED',
      itemsFound: items.length,
      itemsImported: imported,
      itemsSkipped: skipped,
      itemsFailed: failed,
    });

    // Advance the cursor to the newest successful import, but never past the
    // oldest failure so failed items are re-fetched next run (re-fetched
    // successes are deduped). An all-failed run leaves it unchanged (undefined).
    let cursorDate = latestUploadDate;
    if (cursorDate && oldestFailedDate && oldestFailedDate < cursorDate) {
      cursorDate = oldestFailedDate;
    }
    await updateImportSourceTimestamps(importSourceId, cursorDate);
  } catch (error) {
    // Handle scraper failures
    const errorMessage = error instanceof Error ? error.message : String(error);

    await updateImportRun(runId, {
      status: 'FAILED',
      errorMessage,
    });

    await sendImportErrorNotification(importSourceId, errorMessage);

    // Best-effort ops alert on scrape failure.
    try {
      await triggerPagerDutyAlert({
        dedupKey: `scrape-import:${importSourceId}`,
        summary: `Import-source scrape failed (${importSourceId}): ${errorMessage}`,
        component: 'scrape-import',
        links: [
          {
            href: '/dashboard/admin/import-sources',
            text: 'Import sources (admin)',
          },
        ],
        customDetails: { importSourceId, runId, error: errorMessage },
      });
    } catch {
      // swallow — alerting is best-effort
    }

    throw error;
  }
}

/**
 * Simple deterministic hash function for generating workflow IDs.
 *
 * This uses a basic hash algorithm instead of crypto or external libraries for two reasons:
 * 1. Determinism: Temporal workflows must be deterministic and replayable. The crypto module
 *    is disallowed in workflows to prevent non-deterministic behavior.
 * 2. Simplicity: Avoids bundling issues with native modules (like @node-rs/xxhash) or
 *    webpack configuration complexity.
 *
 * The hash is converted to base-36 to create a compact, URL-safe string for workflow IDs.
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}
