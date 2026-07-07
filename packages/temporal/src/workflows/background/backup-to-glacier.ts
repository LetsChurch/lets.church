import { proxyActivities } from '@temporalio/workflow';

import type * as activities from '../../activities/background';
import { GLACIER_QUEUE } from '../../queues';

const { backupToGlacier } = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 minutes',
  heartbeatTimeout: '5 minutes',
  taskQueue: GLACIER_QUEUE,
  retry: { maximumAttempts: 3 },
});

/**
 * Workflow to backup a single upload to S3 with DEEP_ARCHIVE storage class.
 * This workflow is typically launched as a child workflow from handleMultipartMediaUploadWorkflow.
 */
export async function backupToGlacierWorkflow(
  uploadStateId: string,
): Promise<{ backupKey: string; sizeBytes: number }> {
  return backupToGlacier(uploadStateId);
}
