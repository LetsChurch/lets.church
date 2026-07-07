import { proxyActivities } from '@temporalio/workflow';

import type * as processUploadActivities from '../../activities/background';
import { BACKGROUND_QUEUE } from '../../queues';
import type { UploadPostProcessValue } from '../../util/types';

const {
  setUploadThumbnail,
  setChannelAvatar,
  setChannelDefaultThumbnail,
  setChannelCover,
  setOrganizationAvatar,
  setOrganizationCover,
  setProfileAvatar,
  processImage,
} = proxyActivities<typeof processUploadActivities>({
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
  );

  if (postProcess === 'thumbnail') {
    await setUploadThumbnail(targetId, path, blurhash);
  } else if (postProcess === 'profileAvatar') {
    await setProfileAvatar(targetId, path, blurhash);
  } else if (postProcess === 'channelAvatar') {
    await setChannelAvatar(targetId, path, blurhash);
  } else if (postProcess === 'channelDefaultThumbnail') {
    await setChannelDefaultThumbnail(targetId, path, blurhash);
  } else if (postProcess === 'channelCover') {
    await setChannelCover(targetId, path, blurhash);
  } else if (postProcess === 'organizationAvatar') {
    await setOrganizationAvatar(targetId, path, blurhash);
  } else if (postProcess === 'organizationCover') {
    await setOrganizationCover(targetId, path, blurhash);
  }
}
