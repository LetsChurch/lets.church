import { AppUser, db } from '@letschurch/db';
import { getLocation } from '@letschurch/s3/locations';
import { eq } from 'drizzle-orm';
import { invariant } from 'es-toolkit';

import { locationFromArg } from '../../storage/legacy';

export default async function setProfileAvatar(
  userId: string,
  path: string,
  blurhash: string,
  // Absent for workflows started before storage locations existed.
  storageLocation?: string,
) {
  const row = await db
    .select({
      oldPath: AppUser.avatarPath,
      oldLocation: AppUser.avatarLocation,
    })
    .from(AppUser)
    .where(eq(AppUser.id, userId))
    .then((r) => r[0]);

  invariant(row, `User ${userId} not found`);

  await db
    .update(AppUser)
    .set({
      avatarPath: path,
      avatarLocation: locationFromArg(storageLocation),
      avatarBlurhash: blurhash,
      updatedAt: new Date(),
    })
    .where(eq(AppUser.id, userId));

  if (row.oldPath && row.oldPath !== path) {
    await getLocation(locationFromArg(row.oldLocation)).public.deleteFile(
      row.oldPath,
    );
  }
}
