import {
  continueAsNew,
  defineQuery,
  ParentClosePolicy,
  proxyActivities,
  setHandler,
  sleep,
  startChild,
} from '@temporalio/workflow';
import type * as activities from '../../activities/background';
import { BACKGROUND_QUEUE } from '../../queues';
import { backupToGlacierWorkflow } from './backup-to-glacier';

const { claimUploadStatesForBackup, countUploadStatesByStatus } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: '2 minutes',
    heartbeatTimeout: '1 minute',
    taskQueue: BACKGROUND_QUEUE,
    retry: { maximumAttempts: 3 },
  });

// Query to get current progress
export const getBulkBackupProgressQuery = defineQuery<{
  totalStarted: number;
  batchesCompleted: number;
  remaining: number;
}>('getBulkBackupProgress');

export type BulkBackupToGlacierWorkflowParams = {
  batchSize: number;
  delayBetweenBatchesMs: number;
  maxUploads?: number;
  // For continue-as-new tracking
  totalStarted?: number;
  batchesCompleted?: number;
};

/**
 * Workflow to launch backup workflows for all uploads that need backing up.
 *
 * Strategy:
 * - Fetch uploads in batches
 * - Launch child workflows for each upload in the batch
 * - Child workflows run independently with ABANDON policy
 * - Use continue-as-new every 100 batches to prevent workflow history from growing too large
 */
export async function bulkBackupToGlacierWorkflow(
  params: BulkBackupToGlacierWorkflowParams,
): Promise<{
  totalStarted: number;
  batchesCompleted: number;
}> {
  const {
    batchSize,
    delayBetweenBatchesMs,
    maxUploads,
    totalStarted = 0,
    batchesCompleted = 0,
  } = params;

  let currentStarted = totalStarted;
  let currentBatchesCompleted = batchesCompleted;

  // Get initial count of remaining uploads
  const statusCounts = await countUploadStatesByStatus();
  let remaining = statusCounts.NOT_BACKED_UP ?? 0;

  // Set up query handler for progress
  setHandler(getBulkBackupProgressQuery, () => ({
    totalStarted: currentStarted,
    batchesCompleted: currentBatchesCompleted,
    remaining,
  }));

  // Process batches until done
  const maxBatchesBeforeContinueAsNew = 100;
  let batchesInThisRun = 0;

  while (remaining > 0) {
    // Check if we've hit the maxUploads limit
    if (maxUploads !== undefined && currentStarted >= maxUploads) {
      break;
    }

    // Determine how many to claim in this batch
    const claimLimit =
      maxUploads !== undefined
        ? Math.min(batchSize, maxUploads - currentStarted)
        : batchSize;

    if (claimLimit <= 0) {
      break;
    }

    // Atomically claim a batch of uploads by marking them as BACKING_UP
    // This prevents subsequent batches from selecting the same uploads
    const uploads = await claimUploadStatesForBackup(claimLimit);

    if (uploads.length === 0) {
      break;
    }

    // Launch child workflows for each claimed upload
    for (const upload of uploads) {
      try {
        await startChild(backupToGlacierWorkflow, {
          args: [upload.id],
          workflowId: `backupToGlacier:${upload.id}`,
          taskQueue: BACKGROUND_QUEUE,
          parentClosePolicy: ParentClosePolicy.ABANDON,
          retry: { maximumAttempts: 3 },
        });
      } catch (err) {
        // If workflow already exists, that's fine - it's already being backed up
        const isAlreadyStartedError =
          err instanceof Error &&
          err.name === 'WorkflowExecutionAlreadyStartedError';
        if (!isAlreadyStartedError) {
          throw err;
        }
      }

      currentStarted += 1;
    }

    currentBatchesCompleted += 1;
    batchesInThisRun += 1;

    // Update remaining count
    const newStatusCounts = await countUploadStatesByStatus();
    remaining = newStatusCounts.NOT_BACKED_UP ?? 0;

    // If we've processed enough batches, continue-as-new to prevent history bloat
    if (batchesInThisRun >= maxBatchesBeforeContinueAsNew && remaining > 0) {
      // Check maxUploads limit before continuing
      if (maxUploads !== undefined && currentStarted >= maxUploads) {
        break;
      }

      await continueAsNew<typeof bulkBackupToGlacierWorkflow>({
        batchSize,
        delayBetweenBatchesMs,
        maxUploads,
        totalStarted: currentStarted,
        batchesCompleted: currentBatchesCompleted,
      });
    }

    // Add delay between batches
    if (remaining > 0 && delayBetweenBatchesMs > 0) {
      await sleep(delayBetweenBatchesMs);
    }
  }

  return {
    totalStarted: currentStarted,
    batchesCompleted: currentBatchesCompleted,
  };
}
