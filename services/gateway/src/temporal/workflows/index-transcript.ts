import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities';

const { indexTranscript: indexTranscriptActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '1 minute',
});

export default async function indexTranscript(uploadId: string) {
  return await indexTranscriptActivity(uploadId);
}
