import type { Prisma } from '@prisma/client';
import {
  startChild,
  proxyActivities,
  ParentClosePolicy,
} from '@temporalio/workflow';
import type * as backgroundActivities from '../activities/background';
import type * as importActivities from '../activities/import';
import { BACKGROUND_QUEUE, IMPORT_QUEUE } from '../queues';
import { processImageWorkflow } from './process-image';
import { processMediaWorkflow } from './process-media';

const { createUploadRecord } = proxyActivities<typeof backgroundActivities>({
  startToCloseTimeout: '1 minute',
  heartbeatTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 5 },
});

const { importMedia } = proxyActivities<typeof importActivities>({
  startToCloseTimeout: '10 minutes',
  heartbeatTimeout: '5 minutes',
  taskQueue: IMPORT_QUEUE,
  retry: { maximumAttempts: 5 },
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
}: Partial<
  Pick<
    Prisma.UploadRecordCreateArgs['data'],
    'license' | 'visibility' | 'description' | 'publishedAt'
  >
> & {
  url: string;
  username: string;
  channelSlug: string;
  title: string;
}) {
  const uploadRecordId = await createUploadRecord({
    title,
    description,
    license,
    visibility,
    createdBy: { connect: { username } },
    channel: { connect: { slug: channelSlug } },
    ...(publishedAt ? { publishedAt: new Date(publishedAt) } : {}),
  });
  const { mediaUploadKey, thumbnailUploadKey } = await importMedia(
    uploadRecordId,
    url,
  );

  await startChild(processMediaWorkflow, {
    taskQueue: BACKGROUND_QUEUE,
    workflowId: `processMedia:${mediaUploadKey}`,
    args: [uploadRecordId, mediaUploadKey],
    parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_ABANDON,
    retry: { maximumAttempts: 5 },
  });

  if (thumbnailUploadKey) {
    await startChild(processImageWorkflow, {
      taskQueue: BACKGROUND_QUEUE,
      workflowId: `processImage:${thumbnailUploadKey}`,
      args: [uploadRecordId, thumbnailUploadKey, 'thumbnail'],
      parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_ABANDON,
      retry: { maximumAttempts: 5 },
    });
  }
}
