import { AppUserEmail, db } from '@letschurch/db';
import { eq } from 'drizzle-orm';
import logger from '../../util/logger';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/verify-user-email',
  temporalActivity: 'verifyUserEmail',
});

export default async function verifyUserEmailActivity(userId: string) {
  moduleLogger.info(`Verifying email for user ${userId}`);

  await db
    .update(AppUserEmail)
    .set({ verifiedAt: new Date() })
    .where(eq(AppUserEmail.appUserId, userId));

  moduleLogger.info(`Email verified for user ${userId}`);
}
