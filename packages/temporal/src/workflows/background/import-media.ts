import {
  ParentClosePolicy,
  proxyActivities,
  startChild,
} from '@temporalio/workflow';
import type * as importSourceActivities from '../../activities/import-source';
import type { UploadRecordCreateData } from '../../client';
import { BACKGROUND_QUEUE, IMPORT_QUEUE, PRIORITY_IMPORT } from '../../queues';
import {
  CHANNEL_SLUG_KEY,
  IMPORT_SOURCE_ID_KEY,
  UPLOAD_ID_KEY,
  USERNAME_KEY,
} from '../../search-attributes';
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
}): Promise<string> {
  try {
    const { uploadRecordId, mediaUploadKey, thumbnailUploadKey } =
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

    await startChild(processMediaWorkflow, {
      taskQueue,
      workflowId: `processMedia:${mediaUploadKey}`,
      args: [uploadRecordId],
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

    throw error;
  }
}
