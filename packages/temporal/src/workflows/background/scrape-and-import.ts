import {
  ParentClosePolicy,
  proxyActivities,
  startChild,
} from '@temporalio/workflow';
import type * as importSourceActivities from '../../activities/import-source';
import { BACKGROUND_QUEUE, IMPORT_QUEUE } from '../../queues';
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
    const items = await scrapeImportSource(
      source.url,
      source.lastImportedUploadDate,
    );

    let imported = 0;
    let skipped = 0;
    let failed = 0;
    let latestUploadDate: string | undefined;

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

        // Track latest upload date
        if (item.publishedAt) {
          const publishedAtStr = String(item.publishedAt);
          if (!latestUploadDate || publishedAtStr > latestUploadDate) {
            latestUploadDate = publishedAtStr;
          }
        }

        // Start import workflow for each item
        const urlHash = simpleHash(item.url);
        const handle = await startChild(importMediaWorkflow, {
          taskQueue: BACKGROUND_QUEUE,
          workflowId: `importMedia:${importSourceId}:${urlHash}:${Date.now()}`,
          args: [
            {
              url: item.url,
              username: source.createdBy.username,
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
            },
          ],
          parentClosePolicy: ParentClosePolicy.ABANDON,
          retry: { maximumAttempts: 3 },
        });
        uploadRecordId = await handle.result();
        imported++;
      } catch (_error) {
        failed++;
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

    // Update import source timestamps
    await updateImportSourceTimestamps(importSourceId, latestUploadDate);
  } catch (error) {
    // Handle scraper failures
    const errorMessage = error instanceof Error ? error.message : String(error);

    await updateImportRun(runId, {
      status: 'FAILED',
      errorMessage,
    });

    await sendImportErrorNotification(importSourceId, errorMessage);

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
