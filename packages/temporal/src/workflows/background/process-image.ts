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
  // When the uploader finished (web server clock); see uploadDoneSignal.
  requestedAt?: string,
) {
  const { path, blurhash, storageLocation } = await processImage(
    postProcess,
    targetId,
    s3UploadKey,
  );

  if (postProcess === 'thumbnail') {
    // A thumbnail choice the editor made after asking for this image
    // supersedes it. `requestedAt` is absent mid-deploy (a web pod or parent
    // workflow from before it existed); the image is then applied unguarded
    // and unstamped, which the upload page's poll recognizes as success. Don't
    // substitute another time: the page only knows the one it was given.
    await setUploadThumbnail(targetId, path, blurhash, requestedAt);
  } else if (postProcess === 'profileAvatar') {
    await setProfileAvatar(targetId, path, blurhash, storageLocation);
  } else if (postProcess === 'channelAvatar') {
    await setChannelAvatar(targetId, path, blurhash, storageLocation);
  } else if (postProcess === 'channelDefaultThumbnail') {
    await setChannelDefaultThumbnail(targetId, path, blurhash, storageLocation);
  } else if (postProcess === 'channelCover') {
    await setChannelCover(targetId, path, blurhash, storageLocation);
  } else if (postProcess === 'organizationAvatar') {
    await setOrganizationAvatar(targetId, path, blurhash, storageLocation);
  } else if (postProcess === 'organizationCover') {
    await setOrganizationCover(targetId, path, blurhash, storageLocation);
  }
}
