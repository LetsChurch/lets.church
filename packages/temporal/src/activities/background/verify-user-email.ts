import { AppUserEmail, db } from '@letschurch/db';
import { and, eq } from 'drizzle-orm';
import logger from '../../util/logger';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/verify-user-email',
  temporalActivity: 'verifyUserEmail',
});

// Verify only the specific address that received (and acted on) the reset link.
// Completing a reset proves control of that one mailbox — it says nothing about
// any other address on the account. Marking every email verified (WHERE
// appUserId alone) would let a user attach an address they don't own and have it
// silently promoted to "verified" on their next password reset, which then
// satisfies verified-email authorization gates (org/channel invitations, OIDC
// email_verified claims).
export default async function verifyUserEmailActivity(
  userId: string,
  email: string,
) {
  moduleLogger.info(`Verifying email for user ${userId}`);

  await db
    .update(AppUserEmail)
    .set({ verifiedAt: new Date() })
    .where(
      and(eq(AppUserEmail.appUserId, userId), eq(AppUserEmail.email, email)),
    );

  moduleLogger.info(`Email verified for user ${userId}`);
}
