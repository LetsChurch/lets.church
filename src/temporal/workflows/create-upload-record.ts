import type { Prisma } from '@prisma/client';
import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities/background';
import { BACKGROUND_QUEUE } from '../queues';

const { createUploadRecord: createUploadRecordActivity, indexDocument } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute',
    taskQueue: BACKGROUND_QUEUE,
    retry: { maximumAttempts: 5 },
  });

export async function createUploadRecordWorkflow(
  data: Prisma.UploadRecordCreateArgs['data'],
) {
  const rec = await createUploadRecordActivity(data);

  indexDocument('upload', rec.id);

  return rec.id;
}
