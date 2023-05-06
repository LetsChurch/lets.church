import {
  proxyActivities,
  condition,
  defineSignal,
  setHandler,
  startChild,
  ParentClosePolicy,
} from '@temporalio/workflow';
import type { UploadPostProcessValue } from '../../schema/types/mutation';
import type { Client } from '../../util/s3';
import type * as activities from '../activities/background';
import { BACKGROUND_QUEUE } from '../queues';
import { processImageWorkflow } from './process-image';
import { processMediaWorkflow } from './process-media';

const { abortMultipartUpload, completeMultipartUpload, finalizeUploadRecord } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute',
    heartbeatTimeout: '1 minute',
    taskQueue: BACKGROUND_QUEUE,
    retry: { maximumAttempts: 5 },
  });

const { backupObjects } = proxyActivities<typeof activities>({
  startToCloseTimeout: '60 minute',
  heartbeatTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 5 },
});

export const uploadDoneSignal =
  defineSignal<[Array<string>, string]>('uploadDone');

export async function handleMultipartMediaUploadWorkflow(
  uploadRecordId: string,
  to: Client,
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

    await completeMultipartUpload(to, s3UploadId, s3UploadKey, eTags);

    if (postProcess === 'media') {
      await startChild(processMediaWorkflow, {
        args: [uploadRecordId, s3UploadKey],
        workflowId: `processMedia:${s3UploadKey}`,
        taskQueue: BACKGROUND_QUEUE,
        parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_ABANDON,
        retry: {
          maximumAttempts: 5,
        },
      });
    } else {
      await startChild(processImageWorkflow, {
        args: [uploadRecordId, s3UploadKey, postProcess],
        workflowId: `processImage:${s3UploadKey}`,
        taskQueue: BACKGROUND_QUEUE,
        parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_ABANDON,
        retry: {
          maximumAttempts: 5,
        },
      });
    }

    await backupObjects('INGEST', uploadRecordId);
    await backupObjects('PUBLIC', uploadRecordId);
  } else {
    await abortMultipartUpload(to, s3UploadId, s3UploadKey);
  }
}
