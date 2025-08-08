import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities/background';
import { BACKGROUND_QUEUE } from '../queues';

const { updateDailySalt } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 5 },
});

export async function updateDailySaltWorkflow() {
  await updateDailySalt();
}
