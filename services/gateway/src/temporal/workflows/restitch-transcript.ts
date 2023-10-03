import { proxyActivities } from '@temporalio/workflow';
import type * as backgroundActivities from '../activities/background';
import { BACKGROUND_QUEUE } from '../queues';

const { restitchTranscript } = proxyActivities<typeof backgroundActivities>({
  startToCloseTimeout: '5 minutes',
  heartbeatTimeout: '5 minutes',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 2 },
});

export async function restitchTranscriptWorkflow(targetId: string) {
  await restitchTranscript(targetId);
}
