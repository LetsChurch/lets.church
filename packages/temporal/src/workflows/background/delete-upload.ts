import {
  isCancellation,
  log,
  patched,
  proxyActivities,
} from '@temporalio/workflow';

import type * as activities from '../../activities/background';
import { BACKGROUND_QUEUE } from '../../queues';

const {
  deleteUploadRecordDb,
  deleteUploadRecordSearch,
  markUploadDeleted,
  markUploadPrivate,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
  heartbeatTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 5 },
});

const { deleteUploadRecordS3Objects, deleteUploadRecordGlacierBackups } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: '10 minute',
    heartbeatTimeout: '1 minute',
    taskQueue: BACKGROUND_QUEUE,
    retry: { maximumAttempts: 5 },
  });

// Waits (bounded, ~5 min) for the cancelled workflows to close.
const { cancelUploadProcessing } = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes',
  heartbeatTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 3 },
});

/**
 * Cancel the upload's processing/backup workflows so they don't keep running
 * (and retrying, and alerting, and writing files) against an upload we're
 * deleting. Best-effort: a failure here (e.g. an activity worker from before
 * this change, mid-deploy) must never stop the delete itself.
 */
async function stopUploadProcessing(uploadRecordId: string) {
  try {
    await cancelUploadProcessing(uploadRecordId);
  } catch (err) {
    // This delete itself was cancelled: stop here, don't keep deleting.
    if (isCancellation(err)) throw err;
    log.warn('Could not cancel upload processing; deleting anyway', {
      uploadRecordId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Tombstone the upload. Falls back to just hiding it if that fails (e.g. an
 * activity worker from before this change, mid-deploy): the tombstone only
 * makes processing stop more quietly; it must not block the delete.
 */
async function tombstoneUpload(uploadRecordId: string) {
  try {
    await markUploadDeleted(uploadRecordId);
  } catch (err) {
    if (isCancellation(err)) throw err;
    log.warn('Could not tombstone upload; deleting anyway', {
      uploadRecordId,
      error: err instanceof Error ? err.message : String(err),
    });
    await markUploadPrivate(uploadRecordId);
  }
}

export async function deleteUploadWorkflow(uploadRecordId: string) {
  if (!patched('delete-upload-cancels-processing-v1')) {
    await markUploadPrivate(uploadRecordId);
    await deleteUploadRecordSearch(uploadRecordId);
    await deleteUploadRecordS3Objects(uploadRecordId);
    await deleteUploadRecordGlacierBackups(uploadRecordId);
    await deleteUploadRecordDb(uploadRecordId);
    return;
  }

  // Tombstone first: from here on, processing that starts (or retries) sees the
  // upload as deleted and stops quietly at its first step.
  await tombstoneUpload(uploadRecordId);
  // Out of search right away, as before; the cancel below can take minutes.
  await deleteUploadRecordSearch(uploadRecordId);
  // Then stop what's already running before removing anything it might write
  // back, and drop the search doc again in case it re-indexed meanwhile.
  await stopUploadProcessing(uploadRecordId);
  await deleteUploadRecordSearch(uploadRecordId);
  await deleteUploadRecordS3Objects(uploadRecordId);
  // No second cancel needed: anything starting (or retrying) after the
  // tombstone stops quietly at its first step, and a retried delete runs the
  // cancel above again.
  await deleteUploadRecordGlacierBackups(uploadRecordId);
  await deleteUploadRecordDb(uploadRecordId);
}
