import { patched, proxyActivities } from '@temporalio/workflow';

import type * as activities from '../../activities/background';
import type * as transcodeActivities from '../../activities/transcode';
import { BACKGROUND_QUEUE, TRANSCODE_QUEUE } from '../../queues';

const { getUploadStorageLocation } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 5 },
});

const { generatePeaks } = proxyActivities<typeof transcodeActivities>({
  startToCloseTimeout: '20 minutes',
  heartbeatTimeout: '10 minutes',
  taskQueue: TRANSCODE_QUEUE,
  retry: { maximumAttempts: 2 },
});

export async function generatePeaksWorkflow(
  targetId: string,
  s3UploadKey: string,
) {
  const storageLocation = patched('storage-locations-v1')
    ? await getUploadStorageLocation(targetId)
    : undefined;
  await generatePeaks(targetId, s3UploadKey, storageLocation);
}
