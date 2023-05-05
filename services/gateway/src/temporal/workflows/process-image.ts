import { proxyActivities } from '@temporalio/workflow';
import type { UploadPostProcessValue } from '../../schema/types/mutation';
import type * as processUploadActivities from '../activities/background';
import { BACKGROUND_QUEUE } from '../queues';

const { setUploadThumbnail, setChannelAvatar, setProfileAvatar, processImage } =
  proxyActivities<typeof processUploadActivities>({
    startToCloseTimeout: '60 minutes',
    heartbeatTimeout: '1 minute',
    taskQueue: BACKGROUND_QUEUE,
    retry: { maximumAttempts: 5 },
  });

export async function processImageWorkflow(
  targetId: string,
  s3UploadKey: string,
  postProcess: UploadPostProcessValue,
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
