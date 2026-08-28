import {
  continueAsNew,
  ParentClosePolicy,
  proxyActivities,
  startChild,
} from '@temporalio/workflow';

import type * as backgroundActivities from '../../activities/background';
import { BACKGROUND_QUEUE, PRIORITY_REPROCESS } from '../../queues';
import type { ReprocessScope } from '../../reprocess-scope';
import {
  CHANNEL_ID_KEY,
  CHANNEL_SLUG_KEY,
  UPLOAD_ID_KEY,
  USER_ID_KEY,
  USERNAME_KEY,
} from '../../search-attributes';
import { staticMeta, uploadDashboardLinks } from '../../util/dashboard-links';
import { processMediaWorkflow } from './process-media';

const { getReprocessBatch } = proxyActivities<typeof backgroundActivities>({
  startToCloseTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 3 },
});

// Uploads dispatched per iterator history. Each upload is an independent
// processMedia workflow; its chat-completion stages use OpenAI Flex.
const BATCH_SIZE = 50;

export type ReprocessAllOptions = {
  /**
   * Reuse each upload's stored probe.json instead of a fresh download +
   * ffprobe (falling back to a live probe per upload when none is
   * stored). Defaults to true for reprocess runs.
   */
  skipProbe?: boolean;
  /**
   * Inclusive ISO datetime bounds restricting which uploads are
   * selected. The column they apply to is chosen from `processingScope`
   * (creation date for a full run, transcode/transcribe finish date
   * otherwise). Not used by the `no_paragraphs` migration scope.
   */
  dateStart?: string;
  dateEnd?: string;
  /**
   * When true (and the run transcodes), only reprocess uploads that
   * already have a video variant.
   */
  videoOnly?: boolean;
  /**
   * Web origin (WEB_URL) captured by the client at start time, threaded
   * in so each per-upload `processMediaWorkflow` child can be tagged with
   * dashboard deep-links in its User Metadata. The workflow sandbox can't
   * read `process.env`, so this must be passed explicitly; when absent the
   * children simply carry no links.
   */
  webUrl?: string;
};

export async function reprocessAllWorkflow(
  scope: ReprocessScope,
  processingScope: 'transcode' | 'transcribe' | 'everything' = 'transcode',
  cursor: string | null = null,
  options: ReprocessAllOptions = {},
): Promise<void> {
  const skipProbe = options.skipProbe ?? true;
  // Captured once so the narrowing (string vs. undefined) survives into the
  // `.map` closure below. Only ever passed explicitly to
  // `uploadDashboardLinks` — the process.env default it would otherwise read
  // isn't replay-safe inside the workflow sandbox.
  const webUrl = options.webUrl;

  const { items, nextCursor } = await getReprocessBatch(
    scope,
    BATCH_SIZE,
    cursor,
    {
      processingScope,
      dateStart: options.dateStart,
      dateEnd: options.dateEnd,
      videoOnly: options.videoOnly,
    },
  );

  for (const item of items) {
    try {
      // Build the deep-links from the explicitly-threaded webUrl (never the
      // process.env default — that read isn't replay-safe in the sandbox).
      const links = webUrl
        ? uploadDashboardLinks(item.channelId, item.id, webUrl)
        : [];
      await startChild(processMediaWorkflow, {
        workflowId: `reprocessUpload:${item.id}`,
        args: [item.id, processingScope, skipProbe, links],
        taskQueue: BACKGROUND_QUEUE,
        parentClosePolicy: ParentClosePolicy.ABANDON,
        priority: { priorityKey: PRIORITY_REPROCESS },
        retry: { maximumAttempts: 2 },
        ...staticMeta({ summary: `Reprocess (${processingScope})`, links }),
        typedSearchAttributes: [
          { key: UPLOAD_ID_KEY, value: item.id },
          { key: CHANNEL_ID_KEY, value: item.channelId },
          { key: CHANNEL_SLUG_KEY, value: item.channelSlug },
          { key: USER_ID_KEY, value: item.appUserId },
          { key: USERNAME_KEY, value: item.username },
        ],
      });
    } catch (err) {
      if (
        err instanceof Error &&
        err.name === 'WorkflowExecutionAlreadyStartedError'
      ) {
        continue;
      }
      throw err;
    }
  }

  if (nextCursor !== null) {
    await continueAsNew<typeof reprocessAllWorkflow>(
      scope,
      processingScope,
      nextCursor,
      options,
    );
  }
}
