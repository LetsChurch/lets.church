import { executeChild, proxyActivities } from '@temporalio/workflow';
import type * as backgroundActivities from '../activities/background';
import { BACKGROUND_QUEUE } from '../queues';
import { indexDocumentWorkflow } from './index-document';

const { restitchTranscript } = proxyActivities<typeof backgroundActivities>({
  startToCloseTimeout: '5 minutes',
  heartbeatTimeout: '5 minutes',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 2 },
});

export async function restitchTranscriptWorkflow(targetId: string) {
  const transcriptKey = await restitchTranscript(targetId);
  await executeChild(indexDocumentWorkflow, {
    workflowId: `transcript:restitch:${targetId}`,
    args: ['transcript', targetId, transcriptKey],
    taskQueue: BACKGROUND_QUEUE,
    retry: {
      maximumAttempts: 2,
    },
  });
}
