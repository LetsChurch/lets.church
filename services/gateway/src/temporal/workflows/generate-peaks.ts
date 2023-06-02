import { proxyActivities } from '@temporalio/workflow';
import type * as transcodeActivities from '../activities/transcode';
import { TRANSCODE_QUEUE } from '../queues';

const { generatePeaks } = proxyActivities<typeof transcodeActivities>({
  startToCloseTimeout: '10 minutes',
  heartbeatTimeout: '1 minute',
  taskQueue: TRANSCODE_QUEUE,
  retry: { maximumAttempts: 2 },
});

export async function generatePeaksWorkflow(
  targetId: string,
  s3UploadKey: string,
) {
  await generatePeaks(targetId, s3UploadKey);
}
