import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities';

const { transcode } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
});

export default async function processUpload(id: string, url: string) {
  return await transcode(id, url);
}
