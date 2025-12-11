import type { Prisma } from '@letschurch/db';
import {
  ParentClosePolicy,
  proxyActivities,
  startChild,
} from '@temporalio/workflow';
import type * as importSourceActivities from '../../activities/import-source';
import { BACKGROUND_QUEUE, IMPORT_QUEUE } from '../../queues';
import { processImageWorkflow } from './process-image';
import { processMediaWorkflow } from './process-media';

const { importMedia } = proxyActivities<{
  importMedia: (
    url: string,
    data: Prisma.UploadRecordCreateArgs['data'] & { trimSilence?: boolean },
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
    Prisma.UploadRecordCreateArgs['data'],
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
        uploadFinalizedBy: { connect: { username } },
        createdBy: { connect: { username } },
        channel: { connect: { slug: channelSlug } },
        userCommentsEnabled,
        trimSilence,
        ...(publishedAt ? { publishedAt: new Date(publishedAt) } : {}),
      });

    await startChild(processMediaWorkflow, {
      taskQueue,
      workflowId: `processMedia:${mediaUploadKey}`,
      args: [uploadRecordId],
      parentClosePolicy: ParentClosePolicy.ABANDON,
      retry: { maximumAttempts: 5 },
    });

    if (thumbnailUploadKey) {
      await startChild(processImageWorkflow, {
        taskQueue,
        workflowId: `processImage:${thumbnailUploadKey}`,
        args: [uploadRecordId, thumbnailUploadKey, 'thumbnail'],
        parentClosePolicy: ParentClosePolicy.ABANDON,
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
