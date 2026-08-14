import { proxyActivities, workflowInfo } from '@temporalio/workflow';

import type * as activities from '../../activities/background';
import type { UploadRecordCreateData } from '../../client';
import { fingerprintUploadRecordCreateData } from '../../client/create-upload-record';
import { BACKGROUND_QUEUE } from '../../queues';

const { createUploadRecord: createUploadRecordActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 5 },
});

export async function createUploadRecordWorkflow(data: UploadRecordCreateData) {
  const creationOperationId = workflowInfo().workflowId;
  const rec = await createUploadRecordActivity({
    data,
    creationOperationId,
    creationRequestFingerprint: fingerprintUploadRecordCreateData(data),
  });

  // Nothing to index at creation: the searchable media doc (lc_media_v1) is
  // written after transcription + summarization, once the upload has a summary
  // embedding (see process-media / summarize-upload).

  return rec.id;
}
