import { Channel, db } from '@letschurch/db';
import { getLocation } from '@letschurch/s3/locations';
import { eq } from 'drizzle-orm';
import { invariant } from 'es-toolkit';

import { locationFromArg } from '../../storage/legacy';

export default async function setChannelCover(
  channelId: string,
  path: string,
  blurhash: string,
  // Absent for workflows started before storage locations existed.
  storageLocation?: string,
) {
  const row = await db
    .select({ oldPath: Channel.coverPath, oldLocation: Channel.coverLocation })
    .from(Channel)
    .where(eq(Channel.id, channelId))
    .then((r) => r[0]);

  invariant(row, `Channel ${channelId} not found`);

  await db
    .update(Channel)
    .set({
      coverPath: path,
      coverLocation: locationFromArg(storageLocation),
      coverBlurhash: blurhash,
      updatedAt: new Date(),
    })
    .where(eq(Channel.id, channelId));

  if (row.oldPath && row.oldPath !== path) {
    await getLocation(locationFromArg(row.oldLocation)).public.deleteFile(
      row.oldPath,
    );
  }
}
