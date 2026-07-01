import { condition, proxyActivities, setHandler } from '@temporalio/workflow';
import type * as activities from '../../activities/background';
import type { UploadRecordUpdateData } from '../../client';
import { BACKGROUND_QUEUE } from '../../queues';
import { updateUploadRecordSignal } from '../../refs';

export { updateUploadRecordSignal };

const { updateUploadRecord: updateUploadRecordActivity, indexDocument } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute',
    taskQueue: BACKGROUND_QUEUE,
    retry: { maximumAttempts: 5 },
  });

export async function updateUploadRecordWorkflow(uploadRecordId: string) {
  const queue: Array<{ data: UploadRecordUpdateData; skipIndex: boolean }> = [];

  setHandler(
    updateUploadRecordSignal,
    (incomingData, skipIndex = false) =>
      void queue.push({ data: incomingData, skipIndex }),
  );

  while (await condition(() => queue.length > 0, '15 seconds')) {
    let shouldIndex = false;
    while (queue.length > 0) {
      const item = queue.shift();
      if (item) {
        await updateUploadRecordActivity(uploadRecordId, item.data);
        if (!item.skipIndex) {
          shouldIndex = true;
        }
      }
    }
    // Skip the reindex when every batched update opted out (e.g. progress ticks).
    // Re-index the searchable media doc (lc_media_v1); a no-op until the upload
    // has a summary embedding.
    if (shouldIndex) {
      await indexDocument('media', uploadRecordId);
    }
  }
}
