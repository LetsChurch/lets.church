import { proxyActivities, setCurrentDetails } from '@temporalio/workflow';

import type * as activities from '../../activities/background';
import { BACKGROUND_QUEUE } from '../../queues';

const { generateStudyGuide } = proxyActivities<typeof activities>({
  // One non-Flex chat completion over the transcript; a viewer is waiting on
  // it, so it must not sit in the Flex queue.
  startToCloseTimeout: '10 minutes',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 3 },
});

/**
 * Generate an upload's printable study guide. Started on a viewer's first
 * request (one workflow per upload, see makeGenerateStudyGuideWorkflowId), so
 * concurrent requests share a single LLM call.
 */
export async function generateStudyGuideWorkflow(uploadRecordId: string) {
  setCurrentDetails('Generating study guide');
  return generateStudyGuide(uploadRecordId);
}
