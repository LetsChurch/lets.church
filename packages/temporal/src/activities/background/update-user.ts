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
  // Never log the update payload verbatim: `data.password` carries the Argon2
  // password hash during the reset-password flow, which would otherwise be
  // written to durable logs. Log only which fields are being updated.
  const { password: _password, ...nonSecretData } = data;
  const activityLogger = moduleLogger.child({
    temporalActivity: 'updateUserActivity',
    context: {
      args: { targetId },
      meta: JSON.stringify({
        fields: Object.keys(data),
        data: nonSecretData,
      }),
    },
  });

  activityLogger.info('Updating user');

  await db
    .update(AppUser)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(AppUser.id, targetId));

  activityLogger.info('Done updating user');
}
