import {
  proxyActivities,
  condition,
  defineSignal,
  setHandler,
  executeChild,
} from '@temporalio/workflow';
import type { UploadPostProcessValue } from '../../../schema/types/mutation';
import type * as activities from '../../activities/background';
import { PROCESS_UPLOAD_QUEUE } from '../../queues';
import { processUpload as processUploadWorkflow } from '../process-upload';

const { abortMultipartUpload, completeMultipartUpload, finalizeUploadRecord } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: '60 minutes',
    heartbeatTimeout: '1 minute',
  });

export const uploadDoneSignal =
  defineSignal<[Array<string>, string]>('uploadDone');

export async function handleMultipartMediaUploadWorkflow(
  uploadRecordId: string,
  bucket: string,
  s3UploadId: string,
  s3UploadKey: string,
  postProcess: UploadPostProcessValue,
) {
  let eTags: Array<string> | null = null;
  let finalizingUserId: string | null = null;

  setHandler(uploadDoneSignal, (incomingETags, userId) => {
    eTags = incomingETags;
    finalizingUserId = userId;
  });

  await condition(() => !!eTags, '1d');

  if (eTags && finalizingUserId) {
    if (postProcess === 'media') {
      await finalizeUploadRecord(uploadRecordId, finalizingUserId);
    }

    await completeMultipartUpload(bucket, s3UploadId, s3UploadKey, eTags);
    await executeChild(processUploadWorkflow, {
      args: [uploadRecordId, s3UploadKey, postProcess],
      workflowId: `processUpload:${s3UploadKey}`,
      taskQueue: PROCESS_UPLOAD_QUEUE,
      retry: {
        maximumAttempts: 8,
      },
    });
  } else {
    await abortMultipartUpload(bucket, s3UploadId, s3UploadKey);
  }
}
