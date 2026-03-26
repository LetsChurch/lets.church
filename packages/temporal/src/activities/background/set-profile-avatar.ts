import { AppUser, db } from '@letschurch/db';
import { publicS3 } from '@letschurch/s3/public';
import { eq } from 'drizzle-orm';
import { invariant } from 'es-toolkit';

export default async function setProfileAvatar(
  userId: string,
  path: string,
  blurhash: string,
) {
  const row = await db
    .select({ avatarPath: AppUser.avatarPath })
    .from(AppUser)
    .where(eq(AppUser.id, userId))
    .then((r) => r[0]);

  invariant(row, `User ${userId} not found`);
  const { avatarPath: oldPath } = row;

  await db
    .update(AppUser)
    .set({ avatarPath: path, avatarBlurhash: blurhash, updatedAt: new Date() })
    .where(eq(AppUser.id, userId));

  if (oldPath) {
    await publicS3.deleteFile(oldPath);
  }
}
