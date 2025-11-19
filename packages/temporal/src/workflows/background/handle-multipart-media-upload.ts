import type { S3ClientId } from '@letschurch/s3';
import {
  condition,
  defineSignal,
  ParentClosePolicy,
  proxyActivities,
  setHandler,
  startChild,
} from '@temporalio/workflow';
import type * as activities from '../../activities/background';
import { BACKGROUND_QUEUE } from '../../queues';
import type { UploadPostProcessValue } from '../../util/types';
import { backupToGlacierWorkflow } from './backup-to-glacier';
import { processImageWorkflow } from './process-image';
import { processMediaWorkflow } from './process-media';

const {
  abortMultipartUpload,
  completeMultipartUpload,
  finalizeUploadRecord,
  createUploadState,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
  heartbeatTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 5 },
});

export const uploadDoneSignal =
  defineSignal<[Array<string>, string]>('uploadDone');

export type HandleMultipartMediaUploadParams = {
  targetId: string;
  clientId: S3ClientId;
  s3UploadId: string;
  s3UploadKey: string;
  postProcess: UploadPostProcessValue;
};

export async function handleMultipartMediaUploadWorkflow(
  targetId: string,
  clientId: S3ClientId,
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
      await finalizeUploadRecord(targetId, finalizingUserId, s3UploadKey);
    }

    await completeMultipartUpload(clientId, s3UploadId, s3UploadKey, eTags);

    // Create UploadState record and launch backup workflow
    const uploadStateId = await createUploadState({
      s3Key: s3UploadKey,
      clientId,
      uploadType: postProcess,
      uploadRecordId:
        postProcess === 'media' || postProcess === 'thumbnail'
          ? targetId
          : undefined,
      appUserId: postProcess === 'profileAvatar' ? targetId : undefined,
      channelId:
        postProcess === 'channelAvatar' ||
        postProcess === 'channelDefaultThumbnail'
          ? targetId
          : undefined,
      organizationId:
        postProcess === 'organizationAvatar' ? targetId : undefined,
    });

    // Launch backup to Glacier as child workflow (don't await - fire and forget)
    startChild(backupToGlacierWorkflow, {
      args: [uploadStateId],
      workflowId: `backupToGlacier:${s3UploadKey}`,
      taskQueue: BACKGROUND_QUEUE,
      parentClosePolicy: ParentClosePolicy.ABANDON,
      retry: { maximumAttempts: 3 },
    });

    if (postProcess === 'media') {
      await startChild(processMediaWorkflow, {
        args: [targetId],
        workflowId: `processMedia:${s3UploadKey}`,
        taskQueue: BACKGROUND_QUEUE,
        parentClosePolicy: ParentClosePolicy.ABANDON,
        retry: {
          maximumAttempts: 5,
        },
      });
    } else {
      await startChild(processImageWorkflow, {
        args: [targetId, s3UploadKey, postProcess],
        workflowId: `processImage:${s3UploadKey}`,
        taskQueue: BACKGROUND_QUEUE,
        parentClosePolicy: ParentClosePolicy.ABANDON,
        retry: {
          maximumAttempts: 5,
        },
      });
    }
  } else {
    await abortMultipartUpload(clientId, s3UploadId, s3UploadKey);
  }
}
