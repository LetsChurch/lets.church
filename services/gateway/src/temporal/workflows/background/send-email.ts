import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../../activities/background';
import type { EmailArgs } from '../../activities/background/send-email';

const { sendEmail: sendEmailActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
});

export default async function sendEmail(args: EmailArgs) {
  await sendEmailActivity(args);
}
