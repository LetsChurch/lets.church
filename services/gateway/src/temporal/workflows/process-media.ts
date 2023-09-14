import { executeChild, patched, proxyActivities } from '@temporalio/workflow';
import invariant from 'tiny-invariant';
import { probeIsVideoFile } from '../../util/zod';
import type * as backgroundActivities from '../activities/background';
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

const { getFinalizedUploadKey } = proxyActivities<typeof backgroundActivities>({
  startToCloseTimeout: '10 minute',
  heartbeatTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 5 },
});

export async function processMediaWorkflow(
  targetId: string,
  s3UploadKey: string | null | undefined, // TODO: remove this parameter
  scope: 'transcode' | 'transcribe' | 'everything' = 'everything',
) {
  if (!s3UploadKey && patched('fetchS3UploadKeyInWorkflow')) {
    s3UploadKey = await getFinalizedUploadKey(targetId);
  }
  invariant(s3UploadKey, 'missing s3UploadKey');

  const probeRes = await probe(targetId, s3UploadKey);
  invariant(probeRes !== null, 'Probe is null!');

  const transcribePromise =
    scope === 'everything' || scope === 'transcribe'
      ? transcribe(targetId, s3UploadKey)
      : null;

  // Work
  await Promise.all([
    transcribePromise,
    scope === 'everything' || scope === 'transcode'
      ? transcode(targetId, s3UploadKey, probeRes)
      : null,
    ...((scope === 'everything' || scope === 'transcode') &&
    probeIsVideoFile(probeRes)
      ? [createThumbnails(targetId, s3UploadKey, probeRes)]
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
    transcribePromise
      ? executeChild(indexDocumentWorkflow, {
          workflowId: `transcript:${s3UploadKey}`,
          args: [
            'transcript',
            targetId,
            (await transcribePromise).transcriptKey,
          ],
          taskQueue: BACKGROUND_QUEUE,
          retry: {
            maximumAttempts: 2,
          },
        })
      : null,
  ]);
}
