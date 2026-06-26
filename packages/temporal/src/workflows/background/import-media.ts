import {
  ParentClosePolicy,
  proxyActivities,
  setCurrentDetails,
  startChild,
  workflowInfo,
} from '@temporalio/workflow';
import type * as backgroundActivities from '../../activities/background';
import type * as importSourceActivities from '../../activities/import-source';
import type { UploadRecordCreateData } from '../../client';
import { BACKGROUND_QUEUE, IMPORT_QUEUE, PRIORITY_IMPORT } from '../../queues';
import {
  CHANNEL_SLUG_KEY,
  IMPORT_SOURCE_ID_KEY,
  UPLOAD_ID_KEY,
  USERNAME_KEY,
} from '../../search-attributes';
import { staticMeta, uploadDashboardLinks } from '../../util/dashboard-links';
import { processImageWorkflow } from './process-image';
import { processMediaWorkflow } from './process-media';

const { importMedia } = proxyActivities<{
  importMedia: (
    url: string,
    data: UploadRecordCreateData & { trimSilence?: boolean },
  ) => Promise<{
    uploadRecordId: string;
    mediaUploadKey: string;
    thumbnailUploadKey: string | null;
  }>;
}>({
  startToCloseTimeout: '10 hours',
  heartbeatTimeout: '5 hours',
  taskQueue: IMPORT_QUEUE,
  retry: { maximumAttempts: 2 },
});

const { sendImportErrorNotification } = proxyActivities<
  typeof importSourceActivities
>({
  startToCloseTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
});

const { triggerPagerDutyAlert } = proxyActivities<typeof backgroundActivities>({
  startToCloseTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 3 },
});

export async function importMediaWorkflow({
  url,
  username,
  channelSlug,
  title,
  description = null,
  license = 'STANDARD',
  visibility = 'PUBLIC',
  publishedAt,
  userCommentsEnabled = true,
  trimSilence = false,
  taskQueue,
  importSourceId,
  channelId,
  webUrl,
}: Partial<
  Pick<
    UploadRecordCreateData,
    | 'license'
    | 'visibility'
    | 'description'
    | 'publishedAt'
    | 'userCommentsEnabled'
  >
> & {
  url: string;
  username: string;
  channelSlug: string;
  title: string;
  taskQueue: string;
  trimSilence: boolean;
  importSourceId?: string;
  // Channel id + web origin, supplied by the starter (the web client, or
  // `scrapeAndImportWorkflow` which has both). Used to deep-link the
  // processing children to the upload's dashboard page once the upload
  // record id is known. Both must be present to build a link.
  channelId?: string | null;
  webUrl?: string;
}): Promise<string> {
  // Hoisted so the failure path can deep-link to the upload's dashboard
  // page when the failure happens after the upload record was created.
  let uploadRecordId: string | undefined;
  try {
    setCurrentDetails('Downloading & importing source media');
    const { mediaUploadKey, thumbnailUploadKey, ...importIds } =
      await importMedia(url, {
        title,
        description,
        license,
        visibility,
        uploadFinalized: true,
        uploadFinalizedByUsername: username,
        createdByUsername: username,
        channelSlug,
        userCommentsEnabled,
        trimSilence,
        ...(publishedAt
          ? { publishedAt: new Date(publishedAt as string | Date) }
          : {}),
      });
    uploadRecordId = importIds.uploadRecordId;

    // Now that the upload record id exists, resolve its dashboard deep-links
    // and forward them onto the processing children's User Metadata. Built
    // from the explicitly-threaded webUrl (never the process.env default —
    // not replay-safe in the sandbox); empty when channelId/webUrl absent.
    const links =
      channelId && webUrl
        ? uploadDashboardLinks(channelId, uploadRecordId, webUrl)
        : [];

    setCurrentDetails('Launching media processing');
    await startChild(processMediaWorkflow, {
      taskQueue,
      workflowId: `processMedia:${mediaUploadKey}`,
      args: [uploadRecordId, 'everything', false, links],
      priority: { priorityKey: PRIORITY_IMPORT },
      parentClosePolicy: ParentClosePolicy.ABANDON,
      typedSearchAttributes: [
        { key: UPLOAD_ID_KEY, value: uploadRecordId },
        { key: USERNAME_KEY, value: username },
        { key: CHANNEL_SLUG_KEY, value: channelSlug },
        ...(importSourceId
          ? [{ key: IMPORT_SOURCE_ID_KEY, value: importSourceId }]
          : []),
      ],
      ...staticMeta({ summary: 'Process media', links }),
      retry: { maximumAttempts: 5 },
    });

    if (thumbnailUploadKey) {
      await startChild(processImageWorkflow, {
        taskQueue,
        workflowId: `processImage:${thumbnailUploadKey}`,
        args: [uploadRecordId, thumbnailUploadKey, 'thumbnail'],
        priority: { priorityKey: PRIORITY_IMPORT },
        parentClosePolicy: ParentClosePolicy.ABANDON,
        typedSearchAttributes: [
          { key: UPLOAD_ID_KEY, value: uploadRecordId },
          { key: CHANNEL_SLUG_KEY, value: channelSlug },
          ...(importSourceId
            ? [{ key: IMPORT_SOURCE_ID_KEY, value: importSourceId }]
            : []),
        ],
        ...staticMeta({ summary: 'Process image (thumbnail)', links }),
        retry: { maximumAttempts: 5 },
      });
    }

    return uploadRecordId;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Send notification if this is part of an import source
    if (importSourceId) {
      try {
        await sendImportErrorNotification(
          importSourceId,
          `Failed to import media from ${url}: ${errorMessage}`,
        );
      } catch (_notificationError) {
        // Don't fail workflow if notification fails
      }
    }

    // Best-effort ops alert once retries are exhausted.
    const { attempt, retryPolicy } = workflowInfo();
    const maxAttempts = retryPolicy?.maximumAttempts ?? 1;
    if (attempt >= maxAttempts) {
      setCurrentDetails('Failed');
      try {
        await triggerPagerDutyAlert({
          dedupKey: `import-media:${url}`,
          summary: `Media import failed for ${url}: ${errorMessage}`,
          component: 'import-media',
          // Present only when the failure happened after the upload record
          // was created (e.g. during processing kickoff).
          uploadId: uploadRecordId,
          links: [{ href: url, text: 'Source media URL' }],
          customDetails: {
            url,
            importSourceId,
            channelSlug,
            attempt,
            maxAttempts,
            error: errorMessage,
          },
        });
      } catch {
        // swallow — alerting is best-effort
      }
    }

    throw error;
  }
}
