import { proxyActivities, executeChild } from '@temporalio/workflow';
import transcribe from './background/transcribe';
import type * as activities from '../activities/process-upload';
import invariant from 'tiny-invariant';
import { BACKGROUND_QUEUE } from '../queues';

const { transcode, probe, createThumbnails } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '60 minutes',
  heartbeatTimeout: '1 minute',
});

export async function processUpload(id: string) {
  const probeRes = await probe(id);
  invariant(probeRes !== null, 'Probe is null!');

  await Promise.allSettled([
    transcode(id, probeRes),
    createThumbnails(id),
    executeChild(transcribe, {
      workflowId: `transcribe:${id}`,
      args: [id],
      taskQueue: BACKGROUND_QUEUE,
    }),
  ]);
}
