import type { Prisma } from '@prisma/client';
import {
  startChild,
  proxyActivities,
  ParentClosePolicy,
} from '@temporalio/workflow';
import type * as importActivities from '../activities/import';
import { IMPORT_QUEUE } from '../queues';
import { processImageWorkflow } from './process-image';
import { processMediaWorkflow } from './process-media';

const { importMedia } = proxyActivities<typeof importActivities>({
  startToCloseTimeout: '5 hours',
  heartbeatTimeout: '5 minutes',
  taskQueue: IMPORT_QUEUE,
  retry: { maximumAttempts: 2 },
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
}) {
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
    parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_ABANDON,
    retry: { maximumAttempts: 5 },
  });

  if (thumbnailUploadKey) {
    await startChild(processImageWorkflow, {
      taskQueue,
      workflowId: `processImage:${thumbnailUploadKey}`,
      args: [uploadRecordId, thumbnailUploadKey, 'thumbnail'],
      parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_ABANDON,
      retry: { maximumAttempts: 5 },
    });
  }
}
