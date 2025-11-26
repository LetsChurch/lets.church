import { prisma } from '@letschurch/db';
import logger from '../../util/logger';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/verify-user-email',
  temporalActivity: 'verifyUserEmail',
});

export default async function verifyUserEmailActivity(userId: string) {
  moduleLogger.info(`Verifying email for user ${userId}`);

  await prisma.appUserEmail.updateMany({
    where: {
      appUserId: userId,
    },
    data: {
      verifiedAt: new Date(),
    },
  });

  moduleLogger.info(`Email verified for user ${userId}`);
}
