import { proxyActivities } from '@temporalio/workflow';

import type * as activities from '../../activities/background';
import { BACKGROUND_QUEUE } from '../../queues';
import type { SendEmailWorkflowInput } from './send-email-types';

const { sendEmail } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 8 },
});

export async function sendEmailWorkflow(args: SendEmailWorkflowInput) {
  await sendEmail(args);
}
