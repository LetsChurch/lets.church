import { proxyActivities } from '@temporalio/workflow';

import type * as activities from '../../activities/background';
import { BACKGROUND_QUEUE } from '../../queues';

const { sendOrganizationChannelLinkDigest } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '5 minutes',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 3 },
});

export async function organizationChannelLinkDigestWorkflow() {
  return sendOrganizationChannelLinkDigest();
}
