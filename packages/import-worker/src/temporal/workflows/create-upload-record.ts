import type { Prisma } from '@letschurch/db';
import { proxyActivities } from '@temporalio/workflow';

const BACKGROUND_QUEUE = 'background';

const { createUploadRecord: createUploadRecordActivity, indexDocument } =
  proxyActivities<{
    createUploadRecord: (
      data: Prisma.UploadRecordCreateArgs['data'],
    ) => Promise<{ id: string }>;
    indexDocument: (kind: string, uploadId: string) => Promise<void>;
  }>({
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
