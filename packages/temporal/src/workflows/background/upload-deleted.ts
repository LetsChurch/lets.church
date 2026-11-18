import { proxyActivities } from '@temporalio/workflow';

import type * as backgroundActivities from '../../activities/background';
import { BACKGROUND_QUEUE } from '../../queues';

const { isUploadDeleted } = proxyActivities<typeof backgroundActivities>({
  startToCloseTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 3 },
});

/**
 * Whether the upload has been deleted (record gone, or tombstoned by a delete
 * in progress). Assumes not if the check itself fails, so a flaky lookup never
 * hides a real failure.
 */
export async function uploadIsDeleted(uploadRecordId: string) {
  try {
    return await isUploadDeleted(uploadRecordId);
  } catch {
    return false;
  }
}

/**
 * Whether `err` is getFinalizedUploadKey reporting the upload deleted. That's
 * definitive, so it doesn't depend on a follow-up lookup succeeding.
 */
export function isUploadDeletedFailure(err: unknown) {
  const cause = (err as { cause?: { type?: unknown } } | null)?.cause;
  return cause?.type === 'UploadRecordDeleted';
}
