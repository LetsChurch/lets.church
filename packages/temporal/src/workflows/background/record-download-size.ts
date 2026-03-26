import type { UploadVariant } from '@letschurch/db';
import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../../activities/background';
import { BACKGROUND_QUEUE } from '../../queues';

const { recordDownloadSize } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 5 },
});

export async function recordDownloadSizeWorkflow(
  uploadRecordId: string,
  variant: (typeof UploadVariant.enumValues)[number],
  bytes: number,
) {
  await recordDownloadSize(uploadRecordId, variant, bytes);
}
