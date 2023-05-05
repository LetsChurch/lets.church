import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities/background';
import type { EmailArgs } from '../activities/background/send-email';
import { BACKGROUND_QUEUE } from '../queues';

const { sendEmail } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 8 },
});

export async function sendEmailWorkflow(args: EmailArgs) {
  await sendEmail(args);
}
