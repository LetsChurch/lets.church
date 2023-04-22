import { executeChild, proxyActivities } from '@temporalio/workflow';
import invariant from 'tiny-invariant';
import type * as transcodeActivities from '../activities/transcode';
import type * as transcribeActivities from '../activities/transcribe';
import { BACKGROUND_QUEUE, TRANSCODE_QUEUE, TRANSCRIBE_QUEUE } from '../queues';
import { indexDocumentWorkflow } from './index-document';

const { probe } = proxyActivities<typeof transcodeActivities>({
  startToCloseTimeout: '1 minute',
  heartbeatTimeout: '1 minute',
  taskQueue: TRANSCODE_QUEUE,
});

const { transcode, createThumbnails } = proxyActivities<
  typeof transcodeActivities
>({
  startToCloseTimeout: '180 minutes',
  heartbeatTimeout: '1 minute',
  taskQueue: TRANSCODE_QUEUE,
});

const { transcribe } = proxyActivities<typeof transcribeActivities>({
  startToCloseTimeout: '180 minutes',
  heartbeatTimeout: '1 minute',
  taskQueue: TRANSCRIBE_QUEUE,
});

export async function processMediaWorkflow(
  targetId: string,
  s3UploadKey: string,
) {
  const probeRes = await probe(targetId, s3UploadKey);
  invariant(probeRes !== null, 'Probe is null!');

  await Promise.allSettled([
    transcode(targetId, s3UploadKey, probeRes),
    ...(probeRes.streams.some((s) => s.codec_type === 'video')
      ? [createThumbnails(targetId, s3UploadKey)]
      : []),
    transcribe(targetId, s3UploadKey).then((uploadKey) => {
      return executeChild(indexDocumentWorkflow, {
        workflowId: `transcript:${s3UploadKey}`,
        args: ['transcript', targetId, uploadKey],
        taskQueue: BACKGROUND_QUEUE,
        retry: {
          maximumAttempts: 8,
        },
      });
    }),
  ]);
}
