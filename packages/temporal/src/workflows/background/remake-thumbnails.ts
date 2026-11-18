import { patched, proxyActivities } from '@temporalio/workflow';
import { invariant } from 'es-toolkit';

import type * as activities from '../../activities/background';
import type * as transcodeActivities from '../../activities/transcode';
import { BACKGROUND_QUEUE, TRANSCODE_QUEUE } from '../../queues';
import type { Probe } from '../../util/zod';
import { mediaTimeoutMinutes } from './process-media';

// createThumbnails decodes the whole video, so its time limit scales with
// length like processMedia's (a flat 180 minutes timed out 5.7-hour videos).
function createThumbnailsFor(probe: Probe) {
  return proxyActivities<typeof transcodeActivities>({
    startToCloseTimeout: `${mediaTimeoutMinutes(probe)} minutes`,
    heartbeatTimeout: '10 minutes',
    taskQueue: TRANSCODE_QUEUE,
    retry: { maximumAttempts: 2 },
  }).createThumbnails;
}

const { getProbe, getFinalizedUploadKey, getUploadStorageLocation } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: '10 minute',
    heartbeatTimeout: '1 minute',
    taskQueue: BACKGROUND_QUEUE,
    retry: { maximumAttempts: 5 },
  });

const { deleteOldThumbnails } = proxyActivities<typeof activities>({
  startToCloseTimeout: '180 minute',
  heartbeatTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 5 },
});

export async function remakeThumbnailsWorkflow(uploadRecordId: string) {
  const probe = await getProbe(uploadRecordId);
  const finalizedUploadKey = await getFinalizedUploadKey(uploadRecordId);
  invariant(finalizedUploadKey, 'Missing finalizedUploadKey');
  const storageLocation = patched('storage-locations-v1')
    ? await getUploadStorageLocation(uploadRecordId)
    : undefined;
  await createThumbnailsFor(probe)(
    uploadRecordId,
    finalizedUploadKey,
    probe,
    storageLocation,
  );
  await deleteOldThumbnails(uploadRecordId);
}
