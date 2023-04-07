import { executeChild, proxyActivities } from '@temporalio/workflow';
import invariant from 'tiny-invariant';
import type { UploadPostProcessValue } from '../../schema/types/mutation';
import type * as processUploadActivities from '../activities/process-upload';
import { BACKGROUND_QUEUE } from '../queues';
import { indexDocumentWorkflow } from './background';

const { probe, processImage } = proxyActivities<typeof processUploadActivities>(
  {
    startToCloseTimeout: '1 minute',
    heartbeatTimeout: '1 minute',
  },
);

const {
  transcribe,
  transcode,
  createThumbnails,
  setUploadThumbnail,
  setChannelAvatar,
  setProfileAvatar,
} = proxyActivities<typeof processUploadActivities>({
  startToCloseTimeout: '60 minutes',
  heartbeatTimeout: '1 minute',
});

export async function processUpload(
  targetId: string,
  s3UploadKey: string,
  postProcess: UploadPostProcessValue,
) {
  if (postProcess === 'media') {
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
  } else if (
    postProcess === 'thumbnail' ||
    postProcess === 'profileAvatar' ||
    postProcess === 'channelAvatar'
  ) {
    const { path, blurhash } = await processImage(
      postProcess,
      targetId,
      s3UploadKey,
      postProcess === 'profileAvatar' || postProcess === 'channelAvatar'
        ? { width: 96, height: 96 }
        : {},
    );
    if (postProcess === 'thumbnail') {
      await setUploadThumbnail(targetId, path, blurhash);
    } else if (postProcess === 'profileAvatar') {
      await setProfileAvatar(targetId, path, blurhash);
    } else if (postProcess === 'channelAvatar') {
      await setChannelAvatar(targetId, path, blurhash);
    }
  }
}
