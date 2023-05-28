import { proxyActivities, defineSignal } from '@temporalio/workflow';
import type * as activities from '../activities/background';
import { BACKGROUND_QUEUE } from '../queues';

const { deleteUploadRecordDb, deleteUploadRecordSearch, markUploadPrivate } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute',
    heartbeatTimeout: '1 minute',
    taskQueue: BACKGROUND_QUEUE,
    retry: { maximumAttempts: 5 },
  });

const { deleteUploadRecordS3Objects } = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minute',
  heartbeatTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 5 },
});

export const uploadDoneSignal =
  defineSignal<[Array<string>, string]>('uploadDone');

export async function deleteUploadWorkflow(uploadRecordId: string) {
  await markUploadPrivate(uploadRecordId);
  await deleteUploadRecordSearch(uploadRecordId);
  await deleteUploadRecordS3Objects(uploadRecordId);
  await deleteUploadRecordDb(uploadRecordId);
}
