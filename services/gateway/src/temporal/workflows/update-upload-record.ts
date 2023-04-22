import type { Prisma } from '@prisma/client';
import {
  condition,
  defineSignal,
  proxyActivities,
  setHandler,
} from '@temporalio/workflow';
import type * as activities from '../activities/background';
import { BACKGROUND_QUEUE } from '../queues';

const { updateUploadRecord: updateUploadRecordActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
});

export const updateUploadRecordSignal =
  defineSignal<[Prisma.UploadRecordUpdateArgs['data']]>('indexDocument');

export async function updateUploadRecordWorkflow(uploadRecordId: string) {
  const queue: Array<Prisma.UploadRecordUpdateArgs['data']> = [];

  setHandler(
    updateUploadRecordSignal,
    (incomingData) => void queue.push(incomingData),
  );

  while (await condition(() => queue.length > 0, '15 seconds')) {
    let data;
    while ((data = queue.shift())) {
      await updateUploadRecordActivity(uploadRecordId, data);
    }
  }
}
