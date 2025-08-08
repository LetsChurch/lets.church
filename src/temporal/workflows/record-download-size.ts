import type { Prisma, UploadVariant } from '@prisma/client';
import { defineSignal, proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities/background';
import { BACKGROUND_QUEUE } from '../queues';

const { recordDownloadSize } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 5 },
});

export const updateUploadRecordSignal =
  defineSignal<[Prisma.UploadRecordUpdateArgs['data']]>('updateRecord');

export async function recordDownloadSizeWorkflow(
  uploadRecordId: string,
  variant: UploadVariant,
  bytes: number,
) {
  await recordDownloadSize(uploadRecordId, variant, bytes);
}
