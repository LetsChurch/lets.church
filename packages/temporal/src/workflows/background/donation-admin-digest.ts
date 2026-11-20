import { proxyActivities } from '@temporalio/workflow';

import type * as activities from '../../activities/background';
import { BACKGROUND_QUEUE } from '../../queues';

const { sendDonationAdminDigest } = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 5, initialInterval: '1 minute' },
});

// Clearing runs after the digest went out, so it retries until the database
// is back rather than leaving the gifts to be listed again tomorrow.
const { clearDonationAdminDigest } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  // No maximumAttempts: unlimited (the SDK rejects 0).
  retry: {
    initialInterval: '10 seconds',
    backoffCoefficient: 2,
    maximumInterval: '30 minutes',
  },
});

/**
 * Daily at 8:00 Eastern: one email to the site admin listing the gifts that
 * succeeded since the last digest, instead of an email per gift. Skipped when
 * there were none. Failed charges and other notices still go out immediately.
 */
export async function donationAdminDigestWorkflow() {
  const { donationIds } = await sendDonationAdminDigest();
  await clearDonationAdminDigest({ donationIds });
  return { gifts: donationIds.length };
}
