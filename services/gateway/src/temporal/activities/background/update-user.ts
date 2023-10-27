import type { Prisma } from '@prisma/client';
import logger from '../../../util/logger';
import prisma from '../../../util/prisma';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/update-user',
  temporalActivity: 'importMedia',
});

export default async function updateUserActivity(
  targetId: string,
  data: Prisma.AppUserUpdateArgs['data'],
) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'updateUserActivity',
    args: { targetId },
    meta: JSON.stringify({ data }),
  });

  activityLogger.info('Updating user');

  await prisma.appUser.update({
    where: {
      id: targetId,
    },
    data,
  });

  activityLogger.info('Done updating user');
}
