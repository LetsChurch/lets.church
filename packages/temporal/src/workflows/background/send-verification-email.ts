import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../../activities/background';
import { BACKGROUND_QUEUE } from '../../queues';

const { sendVerificationEmail } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 3 },
});

export type SendVerificationEmailArgs = {
  userId: string;
  username: string;
  email: string;
};

export async function sendVerificationEmailWorkflow(
  args: SendVerificationEmailArgs,
) {
  await sendVerificationEmail(args.userId, args.username, args.email);
}
