import type { Prisma } from '@prisma/client';
import logger from '../../../util/logger';
import prisma from '../../../util/prisma';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/update-user',
  temporalActivity: 'importMedia',
});

export default async function updateUserActivity(
  appUserId: string,
  data: Prisma.AppUserUpdateArgs['data'],
) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'updateUserActivity',
    args: { appUserId, data },
  });

  activityLogger.info('Updating user');

  await prisma.appUser.update({
    where: {
      id: appUserId,
    },
    data,
  });

  activityLogger.info('Done updating user');
}
