import { proxyActivities } from '@temporalio/workflow';
import type * as transcribeActivities from '../activities/transcribe';
import { BACKGROUND_QUEUE } from '../queues';

const { restitchTranscript } = proxyActivities<typeof transcribeActivities>({
  startToCloseTimeout: '5 minutes',
  heartbeatTimeout: '5 minutes',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 2 },
});

export async function restitchTranscriptWorkflow(targetId: string) {
  await restitchTranscript(targetId);
}
