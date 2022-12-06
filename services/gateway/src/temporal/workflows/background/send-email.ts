import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../../activities/background';
import type { EmailArgs } from '../../activities/background/send-email';

const { sendEmail } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
});

export async function sendEmailWorkflow(args: EmailArgs) {
  await sendEmail(args);
}
