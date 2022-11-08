import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities';
import invariant from 'tiny-invariant';

const { transcode, probe, createThumbnails } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '60 minutes',
  heartbeatTimeout: '1 minute',
});

export default async function processUpload(id: string) {
  const probeRes = await probe(id);
  invariant(probeRes !== null, 'Probe is null!');

  await Promise.allSettled([
    transcode(id, probeRes),
    createThumbnails(id),
  ]);
}
