import type { Prisma } from '@letschurch/db';
import {
  condition,
  defineSignal,
  proxyActivities,
  setHandler,
} from '@temporalio/workflow';

const BACKGROUND_QUEUE = 'background';

const { updateUploadRecord: updateUploadRecordActivity, indexDocument } =
  proxyActivities<{
    updateUploadRecord: (
      uploadRecordId: string,
      data: Prisma.UploadRecordUpdateArgs['data'],
    ) => Promise<void>;
    indexDocument: (kind: string, uploadId: string) => Promise<void>;
  }>({
    startToCloseTimeout: '1 minute',
    taskQueue: BACKGROUND_QUEUE,
    retry: { maximumAttempts: 5 },
  });

export const updateUploadRecordSignal =
  defineSignal<[Prisma.UploadRecordUpdateArgs['data']]>('updateRecord');

export async function updateUploadRecordWorkflow(uploadRecordId: string) {
  const queue: Array<Prisma.UploadRecordUpdateArgs['data']> = [];

  setHandler(
    updateUploadRecordSignal,
    (incomingData) => void queue.push(incomingData),
  );

  while (await condition(() => queue.length > 0, '15 seconds')) {
    let data: Prisma.UploadRecordUpdateArgs['data'] | undefined;
    while (queue.length > 0) {
      data = queue.shift();
      if (data) {
        await updateUploadRecordActivity(uploadRecordId, data);
      }
    }
    await indexDocument('upload', uploadRecordId);
  }
}
