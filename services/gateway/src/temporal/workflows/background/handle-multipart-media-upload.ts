import {
  proxyActivities,
  condition,
  defineSignal,
  setHandler,
  executeChild,
} from '@temporalio/workflow';
import type * as activities from '../../activities/background';
import { PROCESS_UPLOAD_QUEUE } from '../../queues';
import { processUpload as processUploadWorkflow } from '../process-upload';

const { abortMultipartUpload, completeMultipartUpload } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '60 minutes',
  heartbeatTimeout: '1 minute',
});

export const uploadDoneSignal = defineSignal<[Array<string>]>('uploadDone');

export async function handleMultipartMediaUploadWorkflow(
  uploadKey: string,
  uploadId: string,
) {
  let eTags: Array<string> | null = null;

  setHandler(uploadDoneSignal, (incomingETags) => {
    eTags = incomingETags;
  });

  await condition(() => !!eTags, '1d');

  if (eTags) {
    await completeMultipartUpload(uploadKey, uploadId, eTags);
    await executeChild(processUploadWorkflow, {
      args: [uploadKey],
      workflowId: `processUpload:${uploadKey}`,
      taskQueue: PROCESS_UPLOAD_QUEUE,
    });
  } else {
    await abortMultipartUpload(uploadKey, uploadId);
  }
}
