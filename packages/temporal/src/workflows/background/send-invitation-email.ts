import { proxyActivities } from '@temporalio/workflow';

import type * as activities from '../../activities/background';
import { BACKGROUND_QUEUE } from '../../queues';

const { sendInvitationEmail: sendInvitationEmailActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '2 minutes',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 3 },
});

export async function sendInvitationEmailWorkflow(
  args: activities.InvitationEmailArgs,
) {
  await sendInvitationEmailActivity(args);
}
