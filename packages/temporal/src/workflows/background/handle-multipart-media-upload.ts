import type { S3ClientId } from '@letschurch/s3';
import {
  condition,
  ParentClosePolicy,
  proxyActivities,
  setCurrentDetails,
  setHandler,
  startChild,
} from '@temporalio/workflow';
import type * as activities from '../../activities/background';
import { BACKGROUND_QUEUE, PRIORITY_USER } from '../../queues';
import { uploadDoneSignal } from '../../refs';
import {
  CHANNEL_ID_KEY,
  CHANNEL_SLUG_KEY,
  UPLOAD_ID_KEY,
  USER_ID_KEY,
  USERNAME_KEY,
} from '../../search-attributes';
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

export { uploadDoneSignal };

export type HandleMultipartMediaUploadParams = {
  targetId: string;
  clientId: S3ClientId;
  s3UploadId: string;
  s3UploadKey: string;
  postProcess: UploadPostProcessValue;
};

export type UploadMeta = {
  channelId: string;
  channelSlug: string;
  userId: string;
  username: string;
};

export async function handleMultipartMediaUploadWorkflow(
  targetId: string,
  _clientId: S3ClientId,
  s3UploadId: string,
  s3UploadKey: string,
  postProcess: UploadPostProcessValue,
  uploadMeta?: UploadMeta | null,
) {
  let eTags: Array<string> | null = null;
  let finalizingUserId: string | null = null;

  setHandler(uploadDoneSignal, (incomingETags, userId) => {
    eTags = incomingETags;
    finalizingUserId = userId;
  });

  // Surface the live stage in the Temporal UI User Metadata tab.
  setCurrentDetails('Waiting for upload to finish');
  await condition(() => !!eTags, '1d');

  if (eTags && finalizingUserId) {
    setCurrentDetails('Finalizing upload');
    if (postProcess === 'media') {
      await finalizeUploadRecord(targetId, finalizingUserId, s3UploadKey);
    }

    const sizeBytesStr = await completeMultipartUpload(
      s3UploadId,
      s3UploadKey,
      eTags,
    );

    const meta =
      postProcess === 'media' || postProcess === 'thumbnail'
        ? (uploadMeta ?? null)
        : null;

    const childSearchAttrs = meta
      ? [
          { key: UPLOAD_ID_KEY, value: targetId },
          { key: CHANNEL_ID_KEY, value: meta.channelId },
          { key: CHANNEL_SLUG_KEY, value: meta.channelSlug },
          { key: USER_ID_KEY, value: finalizingUserId },
          { key: USERNAME_KEY, value: meta.username },
        ]
      : undefined;

    // Create UploadState record and launch backup workflow
    // Pass size as string since Temporal cannot serialize bigint
    const uploadStateId = await createUploadState({
      s3Key: s3UploadKey,
      uploadType: postProcess,
      sizeBytes: sizeBytesStr,
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

    setCurrentDetails('Launching processing');
    if (postProcess === 'media') {
      await startChild(processMediaWorkflow, {
        args: [targetId, 'everything'],
        workflowId: `processMedia:${s3UploadKey}`,
        taskQueue: BACKGROUND_QUEUE,
        priority: { priorityKey: PRIORITY_USER },
        parentClosePolicy: ParentClosePolicy.ABANDON,
        typedSearchAttributes: childSearchAttrs,
        retry: {
          maximumAttempts: 5,
        },
      });
    } else {
      await startChild(processImageWorkflow, {
        args: [targetId, s3UploadKey, postProcess],
        workflowId: `processImage:${s3UploadKey}`,
        taskQueue: BACKGROUND_QUEUE,
        priority: { priorityKey: PRIORITY_USER },
        parentClosePolicy: ParentClosePolicy.ABANDON,
        typedSearchAttributes: childSearchAttrs,
        retry: {
          maximumAttempts: 5,
        },
      });
    }
  } else {
    setCurrentDetails('Upload timed out — aborting');
    await abortMultipartUpload(s3UploadId, s3UploadKey);
  }
}
