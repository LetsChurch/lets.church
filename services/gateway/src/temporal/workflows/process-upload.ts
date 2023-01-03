import { executeChild, proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities/process-upload';
import invariant from 'tiny-invariant';
import { indexDocumentWorkflow } from './background';
import { BACKGROUND_QUEUE } from '../queues';

const { probe, transcode, createThumbnails } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '60 minutes',
  heartbeatTimeout: '1 minute',
});

// TODO: figure out how to get more frequent heartbeats
const { transcribe } = proxyActivities<typeof activities>({
  startToCloseTimeout: '60 minutes',
  heartbeatTimeout: '60 minutes',
});

export async function processUpload(id: string) {
  const probeRes = await probe(id);
  invariant(probeRes !== null, 'Probe is null!');

  await Promise.allSettled([
    transcode(id, probeRes),
    ...(probeRes.streams.some((s) => s.codec_type === 'video')
      ? [createThumbnails(id)]
      : []),
    transcribe(id).then(() => {
      return executeChild(indexDocumentWorkflow, {
        workflowId: `transcript:${id}`,
        args: ['transcript', id],
        taskQueue: BACKGROUND_QUEUE,
        retry: {
          maximumAttempts: 8,
        },
      });
    }),
  ]);
}
