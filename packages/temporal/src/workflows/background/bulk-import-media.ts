import {
  ParentClosePolicy,
  setCurrentDetails,
  startChild,
} from '@temporalio/workflow';

import { BACKGROUND_QUEUE, PRIORITY_IMPORT } from '../../queues';
import {
  CHANNEL_ID_KEY,
  CHANNEL_SLUG_KEY,
  USER_ID_KEY,
  USERNAME_KEY,
} from '../../search-attributes';
import { staticMeta } from '../../util/dashboard-links';
import { importMediaWorkflow } from './import-media';

export type BulkMediaImportItem = {
  url: string;
  title: string;
  description?: string;
  publishedAt?: string;
};

export type BulkImportMediaWorkflowParams = {
  bulkImportId: string;
  firstItemIndex: number;
  channelId: string;
  channelSlug: string;
  userId: string;
  username: string;
  license: string;
  visibility: string;
  userCommentsEnabled: boolean;
  webUrl?: string;
  items: BulkMediaImportItem[];
};

/**
 * Dispatches one independent importMediaWorkflow for every uploaded CSV row.
 * This coordinator exists only to keep the web request short and Temporal
 * payloads bounded; it has no relationship to recurring import sources.
 */
export async function bulkImportMediaWorkflow({
  bulkImportId,
  firstItemIndex,
  channelId,
  channelSlug,
  userId,
  username,
  license,
  visibility,
  userCommentsEnabled,
  webUrl,
  items,
}: BulkImportMediaWorkflowParams): Promise<{ workflowCount: number }> {
  setCurrentDetails(`Launching ${items.length} media import workflows`);

  for (const [itemIndex, item] of items.entries()) {
    const csvItemIndex = firstItemIndex + itemIndex;

    await startChild(importMediaWorkflow, {
      taskQueue: BACKGROUND_QUEUE,
      workflowId: `importMedia:${channelSlug}:bulk:${bulkImportId}:${csvItemIndex}`,
      priority: { priorityKey: PRIORITY_IMPORT },
      args: [
        {
          url: item.url,
          username,
          channelSlug,
          title: item.title,
          description: item.description ?? null,
          publishedAt: item.publishedAt ?? new Date(),
          license,
          visibility,
          userCommentsEnabled,
          trimSilence: false,
          taskQueue: BACKGROUND_QUEUE,
          channelId,
          webUrl,
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
        summary: `Import media — @${username}/${channelSlug}`,
        links: [{ href: item.url, text: 'Source media' }],
      }),
    });
  }

  setCurrentDetails(`Launched ${items.length} media import workflows`);
  return { workflowCount: items.length };
}
