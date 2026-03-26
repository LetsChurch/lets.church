import {
  condition,
  defineSignal,
  proxyActivities,
  setHandler,
} from '@temporalio/workflow';
import type * as activities from '../../activities/background';
import type { UploadRecordUpdateData } from '../../client';
import { BACKGROUND_QUEUE } from '../../queues';

const { updateUploadRecord: updateUploadRecordActivity, indexDocument } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute',
    taskQueue: BACKGROUND_QUEUE,
    retry: { maximumAttempts: 5 },
  });

export const updateUploadRecordSignal =
  defineSignal<[UploadRecordUpdateData]>('updateRecord');

export async function updateUploadRecordWorkflow(uploadRecordId: string) {
  const queue: Array<UploadRecordUpdateData> = [];

  setHandler(
    updateUploadRecordSignal,
    (incomingData) => void queue.push(incomingData),
  );

  while (await condition(() => queue.length > 0, '15 seconds')) {
    let data: UploadRecordUpdateData | undefined;
    while (queue.length > 0) {
      data = queue.shift();
      if (data) {
        await updateUploadRecordActivity(uploadRecordId, data);
      }
    }
    await indexDocument('upload', uploadRecordId);
  }
}
