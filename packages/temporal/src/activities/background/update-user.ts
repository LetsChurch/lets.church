import { AppUser, db } from '@letschurch/db';
import { eq } from 'drizzle-orm';
import logger from '../../util/logger';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/update-user',
  temporalActivity: 'importMedia',
});

export type AppUserUpdateData = {
  username?: string;
  password?: string;
  fullName?: string | null;
  avatarPath?: string | null;
  avatarBlurhash?: string | null;
  deletedAt?: Date | null;
  role?: 'USER' | 'ADMIN';
};

export default async function updateUserActivity(
  targetId: string,
  data: AppUserUpdateData,
) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'updateUserActivity',
    context: {
      args: { targetId },
      meta: JSON.stringify({ data }),
    },
  });

  activityLogger.info('Updating user');

  await db
    .update(AppUser)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(AppUser.id, targetId));

  activityLogger.info('Done updating user');
}
