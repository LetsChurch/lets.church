import { proxyActivities } from '@temporalio/workflow';
import invariant from 'tiny-invariant';
import type * as activities from '../activities/background';
import type * as transcodeActivities from '../activities/transcode';
import { BACKGROUND_QUEUE, TRANSCODE_QUEUE } from '../queues';

const { createThumbnails } = proxyActivities<typeof transcodeActivities>({
  startToCloseTimeout: '180 minutes',
  heartbeatTimeout: '10 minutes',
  taskQueue: TRANSCODE_QUEUE,
  retry: { maximumAttempts: 2 },
});

const { getProbe, getFinalizedUploadKey } = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minute',
  heartbeatTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 5 },
});

const { deleteOldThumbnails } = proxyActivities<typeof activities>({
  startToCloseTimeout: '180 minute',
  heartbeatTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 5 },
});

export async function remakeThumbnailsWorkflow(uploadRecordId: string) {
  const probe = await getProbe(uploadRecordId);
  const finalizedUploadKey = await getFinalizedUploadKey(uploadRecordId);
  invariant(finalizedUploadKey, 'Missing finalizedUploadKey');
  await createThumbnails(uploadRecordId, finalizedUploadKey, probe);
  await deleteOldThumbnails(uploadRecordId);
}
