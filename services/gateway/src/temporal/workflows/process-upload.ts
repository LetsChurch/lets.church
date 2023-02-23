import { executeChild, proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities/process-upload';
import invariant from 'tiny-invariant';
import { indexDocumentWorkflow } from './background';
import { BACKGROUND_QUEUE } from '../queues';

const { probe, processThumbnail } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
  heartbeatTimeout: '1 minute',
});

const { transcribe, transcode, createThumbnails } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '60 minutes',
  heartbeatTimeout: '1 minute',
});

export async function processUpload(
  uploadRecordId: string,
  s3UploadKey: string,
  postProcess: 'media' | 'thumbnail',
) {
  if (postProcess === 'media') {
    const probeRes = await probe(uploadRecordId, s3UploadKey);
    invariant(probeRes !== null, 'Probe is null!');

    await Promise.allSettled([
      transcode(uploadRecordId, s3UploadKey, probeRes),
      ...(probeRes.streams.some((s) => s.codec_type === 'video')
        ? [createThumbnails(uploadRecordId, s3UploadKey)]
        : []),
      transcribe(uploadRecordId, s3UploadKey).then((uploadKey) => {
        return executeChild(indexDocumentWorkflow, {
          workflowId: `transcript:${s3UploadKey}`,
          args: ['transcript', uploadRecordId, uploadKey],
          taskQueue: BACKGROUND_QUEUE,
          retry: {
            maximumAttempts: 8,
          },
        });
      }),
    ]);
  } else if (postProcess === 'thumbnail') {
    await processThumbnail(uploadRecordId, s3UploadKey);
  }
}
