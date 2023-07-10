import { executeChild, proxyActivities } from '@temporalio/workflow';
import invariant from 'tiny-invariant';
import { probeIsVideoFile } from '../../util/zod';
import type * as transcodeActivities from '../activities/transcode';
import type * as transcribeActivities from '../activities/transcribe';
import { BACKGROUND_QUEUE, TRANSCODE_QUEUE, TRANSCRIBE_QUEUE } from '../queues';
import { indexDocumentWorkflow } from './index-document';

const { probe } = proxyActivities<typeof transcodeActivities>({
  startToCloseTimeout: '20 minutes',
  heartbeatTimeout: '10 minutes',
  taskQueue: TRANSCODE_QUEUE,
  retry: { maximumAttempts: 2 },
});

const { transcode, createThumbnails } = proxyActivities<
  typeof transcodeActivities
>({
  startToCloseTimeout: '180 minutes',
  heartbeatTimeout: '10 minutes',
  taskQueue: TRANSCODE_QUEUE,
  retry: { maximumAttempts: 2 },
});

const { transcribe } = proxyActivities<typeof transcribeActivities>({
  startToCloseTimeout: '180 minutes',
  heartbeatTimeout: '10 minutes',
  taskQueue: TRANSCRIBE_QUEUE,
  retry: { maximumAttempts: 2 },
});

export async function processMediaWorkflow(
  targetId: string,
  s3UploadKey: string,
) {
  const probeRes = await probe(targetId, s3UploadKey);
  invariant(probeRes !== null, 'Probe is null!');

  const transcribePromise = transcribe(targetId, s3UploadKey);

  // Work
  await Promise.all([
    transcribePromise,
    transcode(targetId, s3UploadKey, probeRes),
    ...(probeIsVideoFile(probeRes)
      ? [createThumbnails(targetId, s3UploadKey)]
      : []),
  ]);

  // Index
  await Promise.all([
    executeChild(indexDocumentWorkflow, {
      workflowId: `upload:${s3UploadKey}`,
      args: ['upload', targetId],
      taskQueue: BACKGROUND_QUEUE,
      retry: {
        maximumAttempts: 2,
      },
    }),
    executeChild(indexDocumentWorkflow, {
      workflowId: `transcript:${s3UploadKey}`,
      args: ['transcript', targetId, (await transcribePromise).transcriptKey],
      taskQueue: BACKGROUND_QUEUE,
      retry: {
        maximumAttempts: 2,
      },
    }),
  ]);
}
